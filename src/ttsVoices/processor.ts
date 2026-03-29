import type { Job } from 'bullmq';
import { Prisma, type TtsVoice } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';
import { tts } from '../tts/tts.helper';

const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';
const PREVIEW_TEXT = "Hello, it's nice to meet you. How are you today?";

const scalarFields = Object.values(Prisma.TtsVoiceScalarFieldEnum) as Prisma.TtsVoiceScalarFieldEnum[];

class TtsVoicesProcessor extends BaseProcessor<TtsVoice> {
  constructor() {
    super('ttsVoice', scalarFields);
  }

  protected override async getTargets(entity: TtsVoice) {
    const ttsProvider = await prisma.ttsProvider.findUnique({ where: { id: entity.ttsProviderId } });
    return { userId: ttsProvider?.userId };
  }

  protected override async onCreated(_job: Job, voice: TtsVoice): Promise<void> {
    await this.generatePreview(voice);
  }

  protected override getFieldHandlers(_job: Job, voice: TtsVoice) {
    return {
      providerVoiceId: () => this.generatePreview(voice),
    };
  }

  private async generatePreview(voice: TtsVoice): Promise<void> {
    try {
      const ttsProvider = await prisma.ttsProvider.findUnique({ where: { id: voice.ttsProviderId } });
      if (!ttsProvider) return;

      const result = await tts(PREVIEW_TEXT, voice, ttsProvider, `${ASSETS_PATH}/ttsVoices`);

      await prisma.ttsVoice.update({
        where: { id: voice.id },
        data: { preview: result.fileName },
      });

      console.log(`[ttsVoice] Preview generated for ${voice.name}: ${result.fileName}`);
    } catch (error: any) {
      console.error(`[ttsVoice] Failed to generate preview for ${voice.name}: ${error.message}`);
      // Don't rethrow — preview failure shouldn't fail the whole job
    }
  }
}

export const ttsVoicesProcessor = new TtsVoicesProcessor();
