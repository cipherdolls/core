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
      dollarPerCharacter: async () => {
        // Job payloads mangle Decimal fields — read the price from the DB
        const dbProvider = await prisma.ttsProvider.findUnique({ where: { id: provider.id } });
        if (!dbProvider) return;
        const free = Number(dbProvider.dollarPerCharacter) === 0;
        const avatars = await prisma.avatar.findMany({
          where: { ttsVoice: { ttsProviderId: provider.id }, free: { not: free } },
        });
        for (const avatar of avatars) {
          await model.avatar.update({ where: { id: avatar.id }, data: { free } }, avatar);
        }
        console.log(`[ttsProvider] dollarPerCharacter changed — set free=${free} on ${avatars.length} avatar(s)`);
      },
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
