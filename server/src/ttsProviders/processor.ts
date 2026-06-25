import { Prisma, type TtsProvider } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.TtsProviderScalarFieldEnum) as Prisma.TtsProviderScalarFieldEnum[];

class TtsProvidersProcessor extends BaseProcessor<TtsProvider> {
  constructor() {
    super('ttsProvider', scalarFields);
  }

  protected override getTargets(entity: TtsProvider) {
    return { userId: entity.userId };
  }
}

export const ttsProvidersProcessor = new TtsProvidersProcessor();
