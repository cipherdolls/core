import { Prisma, type EmbeddingModel } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';

const scalarFields = Object.values(Prisma.EmbeddingModelScalarFieldEnum) as Prisma.EmbeddingModelScalarFieldEnum[];

class EmbeddingModelsProcessor extends BaseProcessor<EmbeddingModel> {
  constructor() {
    super('embeddingModel', scalarFields);
  }

  protected override async getTargets(entity: EmbeddingModel) {
    const aiProvider = await prisma.aiProvider.findUnique({ where: { id: entity.aiProviderId } });
    return { userId: aiProvider?.userId };
  }
}

export const embeddingModelsProcessor = new EmbeddingModelsProcessor();
