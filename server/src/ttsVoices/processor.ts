import { Prisma, type TtsVoice } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';

const scalarFields = Object.values(Prisma.TtsVoiceScalarFieldEnum) as Prisma.TtsVoiceScalarFieldEnum[];

class TtsVoicesProcessor extends BaseProcessor<TtsVoice> {
  constructor() {
    super('ttsVoice', scalarFields);
  }

  protected override async getTargets(entity: TtsVoice) {
    const ttsProvider = await prisma.ttsProvider.findUnique({ where: { id: entity.ttsProviderId } });
    return { userId: ttsProvider?.userId };
  }
}

export const ttsVoicesProcessor = new TtsVoicesProcessor();
