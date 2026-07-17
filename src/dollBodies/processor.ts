import type { Job } from 'bullmq';
import { Prisma, type DollBody } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { model } from '../db';
import { redisConnection } from '../queue/connection';
import { buildPrompt, resolveStyle } from '../tti/prompt';

const scalarFields = Object.values(Prisma.DollBodyScalarFieldEnum) as Prisma.DollBodyScalarFieldEnum[];

class DollBodiesProcessor extends BaseProcessor<DollBody> {
  constructor() {
    super('dollBody', scalarFields);
  }

  protected override async getTargets(entity: DollBody) {
    return { userId: entity.userId };
  }

  /**
   * Generate a picture for the body's appearance (into its gallery, newest is
   * the cover). Claimed atomically so concurrent duplicate events generate
   * once (same pattern as the chat greeting; the worker runs with 2 replicas).
   */
  private async enqueueTti(dollBody: DollBody, reason: string): Promise<void> {
    if (!dollBody.appearance) return;
    const stamp = new Date(dollBody.updatedAt).getTime();
    const claimed = await redisConnection.set(`dollBody:tti:${dollBody.id}:${stamp}`, '1', 'EX', 300, 'NX');
    if (!claimed) return;

    console.log(`[dollBody] ${reason} on ${dollBody.id} — enqueueing TTI generation`);
    const style = await resolveStyle(dollBody.ttiStyleId);
    await model.ttiJob.create({
      data: {
        prompt: buildPrompt(style.template, dollBody.appearance),
        width: style.width,
        height: style.height,
        dollBody: { connect: { id: dollBody.id } },
        user: { connect: { id: dollBody.userId } },
        ...(style.id ? { ttiStyle: { connect: { id: style.id } } } : {}),
      },
    });
  }

  // Body created with an appearance → generate its first picture.
  protected override async onCreated(_job: Job, dollBody: DollBody): Promise<void> {
    await this.enqueueTti(dollBody, 'Created with appearance');
  }

  protected override getFieldHandlers(_job: Job, dollBody: DollBody) {
    return {
      // Appearance changed → regenerate the body's picture.
      appearance: () => this.enqueueTti(dollBody, 'Appearance changed'),
      // Style changed → regenerate in the new style.
      ttiStyleId: () => this.enqueueTti(dollBody, 'Style changed'),
    };
  }
}

export const dollBodiesProcessor = new DollBodiesProcessor();
