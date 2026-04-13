import { Prisma, type KnowledgeBaseChunk } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.KnowledgeBaseChunkScalarFieldEnum) as Prisma.KnowledgeBaseChunkScalarFieldEnum[];

class KnowledgeBaseChunksProcessor extends BaseProcessor<KnowledgeBaseChunk> {
  constructor() {
    super('knowledgeBaseChunk', scalarFields);
  }

  protected override async getTargets(entity: KnowledgeBaseChunk) {
    const { prisma } = await import('../db');
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: entity.knowledgeBaseId },
      include: { scenario: true },
    });
    return { userId: kb?.scenario?.userId };
  }
}

export const knowledgeBaseChunksProcessor = new KnowledgeBaseChunksProcessor();
