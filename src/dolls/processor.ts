import { Prisma, type Doll } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.DollScalarFieldEnum) as Prisma.DollScalarFieldEnum[];

class DollsProcessor extends BaseProcessor<Doll> {
  constructor() {
    super('doll', scalarFields);
  }

  protected override getTargets(entity: Doll) {
    return { userId: entity.userId, dollId: entity.id };
  }
}

export const dollsProcessor = new DollsProcessor();
