import type { Job } from 'bullmq';
import { Prisma, type ChatCompletion } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';
import { chatCompletion } from '../llm/completion';
import { rebuildChatHistory } from '../llm/chatHistory';

const scalarFields = Object.values(Prisma.ChatCompletionScalarFieldEnum) as Prisma.ChatCompletionScalarFieldEnum[];

class ChatCompletionProcessor extends BaseProcessor<ChatCompletion> {
  constructor() {
    super('chatCompletion', scalarFields);
  }

  protected override async getTargets(entity: ChatCompletion) {
    const chat = await prisma.chat.findUnique({ where: { id: entity.chatId } });
    return { chatId: entity.chatId, userId: chat?.userId };
  }

  protected override async onCreated(_job: Job, cc: ChatCompletion): Promise<void> {
    const startTime = Date.now();

    try {
      const chat = await prisma.chat.findUnique({
        where: { id: cc.chatId },
        include: {
          character: { include: { chatModel: { include: { aiProvider: true } } } },
          user: true,
        },
      });
      if (!chat) throw new Error('Chat not found');

      // Call LLM (chat history is fetched inside chatCompletion)
      const result = await chatCompletion(chat as any);

      const chatModel = chat.character.chatModel;

      // Create ASSISTANT message
      const assistantMessage = await model.message.create({
        data: {
          role: 'ASSISTANT',
          content: result.content,
          chat: { connect: { id: chat.id } },
          user: { connect: { id: chat.userId } },
        },
      });

      // Update completion with metrics
      await model.chatCompletion.update({
        where: { id: cc.id },
        data: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          timeTakenMs: Date.now() - startTime,
          message: { connect: { id: assistantMessage.id } },
          chatModel: { connect: { id: chatModel.id } },
        },
      }, cc);

      // Rebuild chat history cache from DB now that the assistant message is persisted
      await rebuildChatHistory(chat.id);

      console.log(`[chatCompletion] Completed: ${result.totalTokens} tokens`);
    } catch (error: any) {
      console.error(`[chatCompletion] Failed:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
      await prisma.chatCompletion.update({
        where: { id: cc.id },
        data: { error: error.message, timeTakenMs: Date.now() - startTime },
      });
    }
  }
}

export const chatCompletionProcessor = new ChatCompletionProcessor();
