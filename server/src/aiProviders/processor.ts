import { Prisma, type AiProvider } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.AiProviderScalarFieldEnum) as Prisma.AiProviderScalarFieldEnum[];

class AiProvidersProcessor extends BaseProcessor<AiProvider> {
  constructor() {
    super('aiProvider', scalarFields);
  }
}

export const aiProvidersProcessor = new AiProvidersProcessor();
