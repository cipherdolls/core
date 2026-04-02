import { Prisma, type SttProvider } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.SttProviderScalarFieldEnum) as Prisma.SttProviderScalarFieldEnum[];

class SttProvidersProcessor extends BaseProcessor<SttProvider> {
  constructor() {
    super('sttProvider', scalarFields);
  }
}

export const sttProvidersProcessor = new SttProvidersProcessor();
