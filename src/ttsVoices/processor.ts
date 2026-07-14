import type { Job } from 'bullmq';
import { Prisma, type TtsVoice } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';
import { tts } from '../tts/tts.helper';

const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';
const DEFAULT_EXAMPLE_TEXT = "Hello, this is a test.";

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
      ttsProviderId: async () => {
        await this.generatePreview(voice);
        await this.updateAvatarsFree(voice);
      },
      action: async () => {
        switch (voice.action) {
          case 'CreateExampleAudio':
            console.log(`[ttsVoice] ${voice.id} action: CreateExampleAudio`);
            await this.generatePreview(voice);
            break;
          case 'Nothing':
            return;
          default:
            console.warn(`[ttsVoice] Unhandled action: ${voice.action}`);
            return;
        }
        await prisma.ttsVoice.update({
          where: { id: voice.id },
          data: { action: 'Nothing' },
        });
      },
    };
  }

  /** Avatar.free derives from the voice's provider cost — propagate when the provider changes */
  private async updateAvatarsFree(voice: TtsVoice): Promise<void> {
    const ttsProvider = await prisma.ttsProvider.findUnique({ where: { id: voice.ttsProviderId } });
    if (!ttsProvider) return;
    const free = Number(ttsProvider.dollarPerCharacter) === 0;
    const avatars = await prisma.avatar.findMany({ where: { ttsVoiceId: voice.id, free: { not: free } } });
    for (const avatar of avatars) {
      await model.avatar.update({ where: { id: avatar.id }, data: { free } }, avatar);
    }
    if (avatars.length) console.log(`[ttsVoice] ${voice.id} provider changed — set free=${free} on ${avatars.length} avatar(s)`);
  }

  private async generatePreview(voice: TtsVoice): Promise<void> {
    try {
      const ttsProvider = await prisma.ttsProvider.findUnique({ where: { id: voice.ttsProviderId } });
      if (!ttsProvider) return;

      const exampleText = ttsProvider.exampleVoiceText || DEFAULT_EXAMPLE_TEXT;
      const result = await tts(exampleText, voice, ttsProvider, `${ASSETS_PATH}/audios`);

      // Delete existing audio record for this voice
      const existing = await prisma.audio.findUnique({ where: { ttsVoiceId: voice.id } });
      if (existing) {
        await prisma.audio.delete({ where: { id: existing.id } });
      }

      // Create new audio record with the filename as ID (without .mp3 extension)
      const audioId = result.fileName!.replace('.mp3', '');
      await prisma.audio.create({
        data: { id: audioId, ttsVoiceId: voice.id },
      });

      console.log(`[ttsVoice] Preview audio created for ${voice.name}: ${audioId}`);
    } catch (error: any) {
      console.error(`[ttsVoice] Failed to generate preview for ${voice.name}: ${error.message}`);
      // Don't rethrow — preview failure shouldn't fail the whole job
    }
  }
}

export const ttsVoicesProcessor = new TtsVoicesProcessor();
