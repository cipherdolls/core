import { Prisma, type Family } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.FamilyScalarFieldEnum) as Prisma.FamilyScalarFieldEnum[];

class FamiliesProcessor extends BaseProcessor<Family> {
  constructor() {
    super('family', scalarFields);
  }
}

export const familiesProcessor = new FamiliesProcessor();
