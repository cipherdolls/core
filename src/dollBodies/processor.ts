import { Prisma, type DollBody } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.DollBodyScalarFieldEnum) as Prisma.DollBodyScalarFieldEnum[];

class DollBodiesProcessor extends BaseProcessor<DollBody> {
  constructor() {
    super('dollBody', scalarFields);
  }

  protected override async getTargets(entity: DollBody) {
    return { userId: entity.userId };
  }
}

export const dollBodiesProcessor = new DollBodiesProcessor();
