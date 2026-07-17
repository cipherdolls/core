import type { Job } from 'bullmq';
import { Prisma, type TtiJob } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { model } from '../db';
import { generateImage } from '../tti/comfyui';
import { savePicture } from '../pictures/pictures';

const scalarFields = Object.values(Prisma.TtiJobScalarFieldEnum) as Prisma.TtiJobScalarFieldEnum[];

class TtiJobsProcessor extends BaseProcessor<TtiJob> {
  constructor() {
    super('ttiJob', scalarFields);
  }

  protected override async getTargets(entity: TtiJob) {
    return { userId: entity.userId };
  }

  protected override async onCreated(_job: Job, ttiJob: TtiJob): Promise<void> {
    const startTime = Date.now();
    try {
      const png = await generateImage(ttiJob.prompt, {
        seed: ttiJob.seed ?? undefined,
        width: ttiJob.width,
        height: ttiJob.height,
      });

      // Into the avatar's gallery (pictures accumulate, newest is the face).
      const file = new File([new Uint8Array(png)], 'generated.png', { type: 'image/png' });
      const fileId = await savePicture(file);
      const picture = await model.picture.create({
        data: { id: fileId, avatarId: ttiJob.avatarId },
      });

      await model.ttiJob.update({
        where: { id: ttiJob.id },
        data: { pictureId: picture.id, timeTakenMs: Date.now() - startTime },
      }, ttiJob);
      console.log(`[ttiJob] Generated picture ${picture.id} for avatar ${ttiJob.avatarId} in ${Date.now() - startTime}ms`);
    } catch (error: any) {
      console.error(`[ttiJob] Generation failed for ${ttiJob.id}:`, error.message);
      await model.ttiJob.update({
        where: { id: ttiJob.id },
        data: { error: error.message, timeTakenMs: Date.now() - startTime },
      }, ttiJob);
    }
  }
}

export const ttiJobsProcessor = new TtiJobsProcessor();
