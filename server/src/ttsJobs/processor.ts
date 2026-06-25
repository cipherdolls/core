import type { Job } from 'bullmq';
import { Prisma, type TtsJob } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';
import { tts } from '../tts/tts.helper';
import { publishTtsStart, publishTtsChunk, publishTtsEnd, publishTtsError } from '../redisPubSub/redisPubSub';

const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';

const scalarFields = Object.values(Prisma.TtsJobScalarFieldEnum) as Prisma.TtsJobScalarFieldEnum[];

class TtsJobsProcessor extends BaseProcessor<TtsJob> {
  constructor() {
    super('ttsJob', scalarFields);
  }

  protected override async getTargets(entity: TtsJob) {
    const message = await prisma.message.findUnique({ where: { id: entity.messageId }, include: { chat: true } });
    return { userId: message?.chat?.userId, chatId: message?.chatId };
  }

  protected override async onCreated(_job: Job, ttsJob: TtsJob): Promise<void> {
    const startTime = Date.now();
    const message = await prisma.message.findUnique({
      where: { id: ttsJob.messageId },
      include: { chat: { include: { character: { include: { ttsVoice: { include: { ttsProvider: true } } } } } } },
    });
    if (!message?.content || !message.chat?.character?.ttsVoice) return;

    try {
      const voice = message.chat.character.ttsVoice;
      const provider = voice.ttsProvider;

      publishTtsStart(message.chatId, message.id);
      let chunkCount = 0;
      let firstChunkMs = 0;
      const result = await tts(message.content, voice, provider, `${ASSETS_PATH}/messages`, {
        onChunk: (chunk: Buffer) => {
          chunkCount++;
          if (chunkCount === 1) {
            firstChunkMs = Date.now() - startTime;
            console.log(`[ttsJob] First chunk streamed: ${firstChunkMs}ms, size=${chunk.length} bytes`);
          }
          publishTtsChunk(message.chatId, chunk);
        },
      });
      console.log(`[ttsJob] Stream done: ${chunkCount} chunks, first chunk at ${firstChunkMs}ms, total ${Date.now() - startTime}ms`);
      publishTtsEnd(message.chatId, message.id);

      await model.message.update({
        where: { id: message.id },
        data: { completed: true },
      }, message);

      await model.ttsJob.update({
        where: { id: ttsJob.id },
        data: {
          characters: result.characters,
          timeTakenMs: Date.now() - startTime,
          ttsVoice: { connect: { id: voice.id } },
        },
      }, ttsJob);

      console.log(`[ttsJob] Completed: ${result.characters} chars`);
    } catch (error: any) {
      publishTtsError(message.chatId, message.id, error.message ?? String(error));
      console.error(`[ttsJob] Failed: ${error.message}`);
      await prisma.ttsJob.update({
        where: { id: ttsJob.id },
        data: { error: error.message, timeTakenMs: Date.now() - startTime },
      });
    }
  }
}

export const ttsJobsProcessor = new TtsJobsProcessor();
