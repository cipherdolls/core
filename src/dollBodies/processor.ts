import { Prisma, type DollBody } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';

const scalarFields = Object.values(Prisma.DollBodyScalarFieldEnum) as Prisma.DollBodyScalarFieldEnum[];

class DollBodiesProcessor extends BaseProcessor<DollBody> {
  constructor() {
    super('dollBody', scalarFields);
  }

  protected override async getTargets(entity: DollBody) {
    const avatar = await prisma.avatar.findUnique({ where: { id: entity.avatarId } });
    return { userId: avatar?.userId };
  }
}

export const dollBodiesProcessor = new DollBodiesProcessor();
