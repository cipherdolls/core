import { Prisma, type ReasoningModel } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';

const scalarFields = Object.values(Prisma.ReasoningModelScalarFieldEnum) as Prisma.ReasoningModelScalarFieldEnum[];

class ReasoningModelsProcessor extends BaseProcessor<ReasoningModel> {
  constructor() {
    super('reasoningModel', scalarFields);
  }

  protected override async getTargets(entity: ReasoningModel) {
    const aiProvider = await prisma.aiProvider.findUnique({ where: { id: entity.aiProviderId } });
    return { userId: aiProvider?.userId };
  }
}

export const reasoningModelsProcessor = new ReasoningModelsProcessor();
