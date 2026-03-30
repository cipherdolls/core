import type { Job } from 'bullmq';
import { Prisma, type Message } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';
import { enqueueCreated } from '../queue/enqueue';

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
        const sttJob = await prisma.sttJob.create({
          data: {
            message: { connect: { id: message.id } },
            sttProvider: { connect: { id: chat.sttProviderId } },
          },
        });
        await enqueueCreated('sttJob', sttJob);
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
        const ttsJob = await prisma.ttsJob.create({
          data: { message: { connect: { id: message.id } } },
        });
        await enqueueCreated('ttsJob', ttsJob);
      }
      await this.createEmbeddingJob(message);
    }
  }

  private async createChatCompletionJob(message: Message): Promise<void> {
    const ccJob = await prisma.chatCompletionJob.create({
      data: {
        chat: { connect: { id: message.chatId } },
        message: { connect: { id: message.id } },
      },
    });
    await enqueueCreated('chatCompletionJob', ccJob);
  }

  private async createEmbeddingJob(message: Message): Promise<void> {
    const chat = await prisma.chat.findUnique({
      where: { id: message.chatId },
      include: { scenario: true },
    });
    if (!chat?.scenario?.embeddingModelId) return;
    if (chat.scenario.type === 'ROLEPLAY') return;

    console.log(`[message] Enqueue embedding for message ${message.id}`);
    const embeddingJob = await prisma.embeddingJob.create({
      data: { message: { connect: { id: message.id } } },
    });
    await enqueueCreated('embeddingJob', embeddingJob);
  }

  protected override getFieldHandlers(_job: Job, message: Message) {
    return {
      content: async () => {
        console.log(`[message] Content changed for ${message.id}`);
      },
    };
  }
}

export const messagesProcessor = new MessagesProcessor();
