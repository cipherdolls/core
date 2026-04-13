import { Prisma, type KnowledgeBase } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';

const scalarFields = Object.values(Prisma.KnowledgeBaseScalarFieldEnum) as Prisma.KnowledgeBaseScalarFieldEnum[];

class KnowledgeBasesProcessor extends BaseProcessor<KnowledgeBase> {
  constructor() {
    super('knowledgeBase', scalarFields);
  }

  protected override async getTargets(entity: KnowledgeBase) {
    const scenario = await prisma.scenario.findUnique({ where: { id: entity.scenarioId } });
    return { userId: scenario?.userId };
  }
}

export const knowledgeBasesProcessor = new KnowledgeBasesProcessor();
