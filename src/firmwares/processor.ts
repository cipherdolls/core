import { Prisma, type Firmware } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';

const scalarFields = Object.values(Prisma.FirmwareScalarFieldEnum) as Prisma.FirmwareScalarFieldEnum[];

class FirmwaresProcessor extends BaseProcessor<Firmware> {
  constructor() {
    super('firmware', scalarFields);
  }

  protected override async getTargets(entity: Firmware) {
    const dollBody = await prisma.dollBody.findUnique({ where: { id: entity.dollBodyId } });
    if (!dollBody) return {};
    const avatar = await prisma.avatar.findUnique({ where: { id: dollBody.avatarId } });
    return { userId: avatar?.userId };
  }
}

export const firmwaresProcessor = new FirmwaresProcessor();
