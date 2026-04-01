import type { Job } from 'bullmq';
import { Prisma, type Message } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';
import { appendChatHistory, invalidateChatHistory } from '../llm/chatHistory';

const scalarFields = Object.values(Prisma.MessageScalarFieldEnum) as Prisma.MessageScalarFieldEnum[];

class MessagesProcessor extends BaseProcessor<Message> {
  constructor() {
    super('message', scalarFields);
  }

  protected override async getTargets(message: Message) {
    const chat = await prisma.chat.findUnique({ where: { id: message.chatId } });
    return { userId: chat?.userId, chatId: message.chatId };
  }

  protected override async onCreated(_job: Job, message: Message): Promise<void> {
    // Append every message to the Redis chat history cache
    await appendChatHistory(message);

    switch (message.role) {
      case 'USER':
        await this.handleUserCreated(message);
        break;
      case 'ASSISTANT':
        await this.handleAssistantCreated(message);
        break;
      case 'SYSTEM':
        console.log(`[message] System message. Enqueue chatCompletion.`);
        await this.createChatCompletionJob(message);
        break;
    }
  }

  private async handleUserCreated(message: Message): Promise<void> {
    const hasText = Boolean(message.content?.trim().length);
    const hasAudio = Boolean(message.fileName);

    if (hasAudio && hasText) {
      console.log(`[message] User message with audio+text. Using text, ignoring audio.`);
      await this.createChatCompletionJob(message);
      await this.createEmbeddingJob(message);
    } else if (hasAudio) {
      console.log(`[message] User audio-only message. Enqueue STT.`);
      const chat = await prisma.chat.findUnique({ where: { id: message.chatId } });
      if (chat?.sttProviderId) {
        await model.sttJob.create({
          data: {
            message: { connect: { id: message.id } },
            sttProvider: { connect: { id: chat.sttProviderId } },
          },
        });
      }
    } else if (hasText) {
      console.log(`[message] User text message. Enqueue chatCompletion + embedding.`);
      await this.createChatCompletionJob(message);
      await this.createEmbeddingJob(message);
    } else {
      console.warn(`[message] User message ${message.id} has neither audio nor text`);
    }
  }

  private async handleAssistantCreated(message: Message): Promise<void> {
    const hasText = Boolean(message.content?.trim());
    const hasAudio = Boolean(message.fileName);
    if (hasText && !hasAudio) {
      const chat = await prisma.chat.findUnique({ where: { id: message.chatId } });
      if (chat?.tts) {
        console.log(`[message] Assistant text message, TTS enabled. Enqueue TTS.`);
        await model.ttsJob.create({
          data: { message: { connect: { id: message.id } } },
        });
      }
      await this.createEmbeddingJob(message);
    }
  }

  private async createChatCompletionJob(message: Message): Promise<void> {
    await model.chatCompletionJob.create({
      data: {
        chat: { connect: { id: message.chatId } },
        message: { connect: { id: message.id } },
      },
    });
  }

  private async createEmbeddingJob(message: Message): Promise<void> {
    const chat = await prisma.chat.findUnique({
      where: { id: message.chatId },
      include: { scenario: true },
    });
    if (!chat?.scenario?.embeddingModelId) return;
    if (chat.scenario.type === 'ROLEPLAY') return;

    console.log(`[message] Enqueue embedding for message ${message.id}`);
    await model.embeddingJob.create({
      data: { message: { connect: { id: message.id } } },
    });
  }

  protected override async handleDeleted(job: Job): Promise<void> {
    const message = job.data[this.entityName] as Message;
    await invalidateChatHistory(message.chatId);
    return super.handleDeleted(job);
  }

  protected override getFieldHandlers(_job: Job, message: Message) {
    return {
      content: async () => {
        console.log(`[message] Content changed for ${message.id}`);
        // Content changed (e.g. STT filled in text) — invalidate so it rebuilds from DB
        await invalidateChatHistory(message.chatId);
      },
    };
  }
}

export const messagesProcessor = new MessagesProcessor();
