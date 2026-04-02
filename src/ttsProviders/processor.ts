import type { Job } from 'bullmq';
import { Prisma, type TtsProvider } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';

const scalarFields = Object.values(Prisma.TtsProviderScalarFieldEnum) as Prisma.TtsProviderScalarFieldEnum[];

class TtsProvidersProcessor extends BaseProcessor<TtsProvider> {
  constructor() {
    super('ttsProvider', scalarFields);
  }

  protected override getTargets(entity: TtsProvider) {
    return { userId: entity.userId };
  }

  protected override getFieldHandlers(_job: Job, provider: TtsProvider) {
    return {
      exampleVoiceText: async () => {
        const voices = await prisma.ttsVoice.findMany({
          where: { ttsProviderId: provider.id },
        });
        console.log(`[ttsProvider] exampleVoiceText changed, regenerating ${voices.length} voice previews`);
        for (const voice of voices) {
          await model.ttsVoice.update({
            where: { id: voice.id },
            data: { action: 'CreateExampleAudio' },
          }, voice);
        }
      },
    };
  }
}

export const ttsProvidersProcessor = new TtsProvidersProcessor();
