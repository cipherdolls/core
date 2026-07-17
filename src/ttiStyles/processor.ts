import { Prisma, type TtiStyle } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.TtiStyleScalarFieldEnum) as Prisma.TtiStyleScalarFieldEnum[];

class TtiStylesProcessor extends BaseProcessor<TtiStyle> {
  constructor() {
    super('ttiStyle', scalarFields);
  }
}

export const ttiStylesProcessor = new TtiStylesProcessor();
