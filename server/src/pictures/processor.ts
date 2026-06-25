import { Prisma, type Picture } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';

const scalarFields = Object.values(Prisma.PictureScalarFieldEnum) as Prisma.PictureScalarFieldEnum[];

class PicturesProcessor extends BaseProcessor<Picture> {
  constructor() {
    super('picture', scalarFields);
  }

  protected override async getTargets(entity: Picture) {
    if (entity.characterId) {
      const character = await prisma.character.findUnique({ where: { id: entity.characterId } });
      return { userId: character?.userId };
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
    return {};
  }
}

export const picturesProcessor = new PicturesProcessor();
