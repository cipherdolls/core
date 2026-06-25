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
    // Assign the configured STT provider (recommended first, else any)
    const sttProvider =
      (await prisma.sttProvider.findFirst({ where: { recommended: true } })) ??
      (await prisma.sttProvider.findFirst());

    if (sttProvider) {
      await model.chat.update({
        where: { id: chat.id },
        data: { sttProvider: { connect: { id: sttProvider.id } } },
      }, chat);
    }
  }

  protected override getFieldHandlers(_job: Job, chat: Chat) {
    return {
      action: async () => {
        switch (chat.action) {
          case 'Init':
            console.log(`[chat] ${chat.id} action: Init — deleting messages, rebuilding prompt`);
            await prisma.message.deleteMany({ where: { chatId: chat.id } });
            await invalidateChatHistory(chat.id);
            await buildAndCacheSystemPrompt(chat.id);

            const character = await prisma.character.findUnique({ where: { id: chat.characterId } });
            if (character?.greeting) {
              await model.message.create({
                data: {
                  role: 'ASSISTANT',
                  content: character.greeting,
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
