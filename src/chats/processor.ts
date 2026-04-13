import type { Job } from 'bullmq';
import { Prisma, type Chat } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';
import { buildAndCacheSystemPrompt } from './systemPrompt';
import { invalidateChatHistory } from '../llm/chatHistory';

const scalarFields = Object.values(Prisma.ChatScalarFieldEnum) as Prisma.ChatScalarFieldEnum[];

class ChatsProcessor extends BaseProcessor<Chat> {
  constructor() {
    super('chat', scalarFields);
  }

  protected override getTargets(chat: Chat) {
    return { userId: chat.userId, chatId: chat.id };
  }

  protected override async onCreated(_job: Job, chat: Chat): Promise<void> {
    // Assign STT provider
    const user = await prisma.user.findUnique({ where: { id: chat.userId } });
    if (!user) return;

    const spendable = Number(user.tokenSpendable ?? 0);
    let sttProvider = null;

    if (spendable > 1) {
      const recommended = await prisma.sttProvider.findFirst({ where: { recommended: true } });
      if (recommended) sttProvider = recommended;
    }

    if (!sttProvider) {
      const free = await prisma.sttProvider.findFirst({ where: { free: true } });
      if (free) sttProvider = free;
    }

    if (sttProvider) {
      await model.chat.update({
        where: { id: chat.id },
        data: { sttProvider: { connect: { id: sttProvider.id } } },
      }, chat);
    }
  }

  protected override getFieldHandlers(job: Job, chat: Chat) {
    return {
      knowledgeContext: async () => {
        console.log(`[chat] ${chat.id} knowledgeContext updated — rebuilding system prompt`);
        await buildAndCacheSystemPrompt(chat.id);
      },
      messageContext: async () => {
        console.log(`[chat] ${chat.id} messageContext updated — rebuilding system prompt`);
        await buildAndCacheSystemPrompt(chat.id);
      },
      action: async () => {
        switch (chat.action) {
          case 'Init':
            console.log(`[chat] ${chat.id} action: Init — deleting messages, rebuilding prompt`);
            await prisma.message.deleteMany({ where: { chatId: chat.id } });
            await invalidateChatHistory(chat.id);
            await buildAndCacheSystemPrompt(chat.id);

            // Create greeting message if scenario has one (triggers TTS via message processor)
            const scenario = await prisma.scenario.findUnique({ where: { id: chat.scenarioId } });
            if (scenario?.greeting) {
              await model.message.create({
                data: {
                  role: 'ASSISTANT',
                  content: scenario.greeting,
                  chat: { connect: { id: chat.id } },
                  user: { connect: { id: chat.userId } },
                },
              });
            }
            break;
          case 'RefreshSystemPrompt':
            console.log(`[chat] ${chat.id} action: RefreshSystemPrompt`);
            await buildAndCacheSystemPrompt(chat.id);
            break;
          case 'Nothing':
            return;
          default:
            console.warn(`[chat] Unhandled action: ${chat.action}`);
            return;
        }
        await prisma.chat.update({
          where: { id: chat.id },
          data: { action: 'Nothing' },
        });
      },
    };
  }
}

export const chatsProcessor = new ChatsProcessor();
