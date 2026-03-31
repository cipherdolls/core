import type { Job } from 'bullmq';
import { Prisma, type EmbeddingJob } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';

const scalarFields = Object.values(Prisma.EmbeddingJobScalarFieldEnum) as Prisma.EmbeddingJobScalarFieldEnum[];

class EmbeddingJobsProcessor extends BaseProcessor<EmbeddingJob> {
  constructor() {
    super('embeddingJob', scalarFields);
  }

  protected override async getTargets(entity: EmbeddingJob) {
    const message = await prisma.message.findUnique({ where: { id: entity.messageId }, include: { chat: true } });
    return { userId: message?.chat?.userId, chatId: message?.chatId };
  }

  protected override async onCreated(_job: Job, embeddingJob: EmbeddingJob): Promise<void> {
    const startTime = Date.now();

    try {
      const message = await prisma.message.findUnique({
        where: { id: embeddingJob.messageId },
        include: { chat: { include: { scenario: { include: { embeddingModel: true } } } } },
      });

      if (!message?.content || !message.chat?.scenario?.embeddingModel) {
        console.log(`[embeddingJob] Skipping — no content or embedding model`);
        return;
      }

      const embeddingModel = message.chat.scenario.embeddingModel;

      // TODO: actual embedding generation via OpenAI-compatible API
      // For now, record minimal metrics so the CUD pipeline fires correctly
      const inputTokens = Math.ceil(message.content.length / 4);
      const usdCost = inputTokens * Number(embeddingModel.dollarPerInputToken);

      await model.embeddingJob.update({
        where: { id: embeddingJob.id },
        data: {
          inputTokens,
          totalTokens: inputTokens,
          usdCost,
          timeTakenMs: Date.now() - startTime,
          embeddingModel: { connect: { id: embeddingModel.id } },
        },
      }, embeddingJob);

      console.log(`[embeddingJob] Completed: ${inputTokens} tokens, $${usdCost.toFixed(6)}`);
    } catch (error: any) {
      console.error(`[embeddingJob] Failed: ${error.message}`);
      await prisma.embeddingJob.update({
        where: { id: embeddingJob.id },
        data: { error: error.message, timeTakenMs: Date.now() - startTime },
      });
    }
  }
}

export const embeddingJobsProcessor = new EmbeddingJobsProcessor();
