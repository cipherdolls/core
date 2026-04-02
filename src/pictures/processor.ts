import { Prisma, type Picture } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';

const scalarFields = Object.values(Prisma.PictureScalarFieldEnum) as Prisma.PictureScalarFieldEnum[];

class PicturesProcessor extends BaseProcessor<Picture> {
  constructor() {
    super('picture', scalarFields);
  }

  protected override async getTargets(entity: Picture) {
    if (entity.dollId) {
      const doll = await prisma.doll.findUnique({ where: { id: entity.dollId } });
      return { userId: doll?.userId, dollId: doll?.id };
    }
    if (entity.avatarId) {
      const avatar = await prisma.avatar.findUnique({ where: { id: entity.avatarId } });
      return { userId: avatar?.userId };
    }
    if (entity.scenarioId) {
      const scenario = await prisma.scenario.findUnique({ where: { id: entity.scenarioId } });
      return { userId: scenario?.userId };
    }
    if (entity.aiProviderId) {
      const provider = await prisma.aiProvider.findUnique({ where: { id: entity.aiProviderId } });
      return { userId: provider?.userId };
    }
    if (entity.sttProviderId) {
      const provider = await prisma.sttProvider.findUnique({ where: { id: entity.sttProviderId } });
      return { userId: provider?.userId };
    }
    if (entity.ttsProviderId) {
      const provider = await prisma.ttsProvider.findUnique({ where: { id: entity.ttsProviderId } });
      return { userId: provider?.userId };
    }
    if (entity.dollBodyId) {
      return {};
    }
    return {};
  }
}

export const picturesProcessor = new PicturesProcessor();
