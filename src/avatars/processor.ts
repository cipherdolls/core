import type { Job } from 'bullmq';
import { Prisma, type Avatar } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';
import { tts } from '../tts/tts.helper';

const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';

const scalarFields = Object.values(Prisma.AvatarScalarFieldEnum) as Prisma.AvatarScalarFieldEnum[];

class AvatarsProcessor extends BaseProcessor<Avatar> {
  constructor() {
    super('avatar', scalarFields);
  }

  protected override getTargets(entity: Avatar) {
    return { userId: entity.userId };
  }

  protected override getFieldHandlers(_job: Job, avatar: Avatar) {
    return {
      introduction: () => this.generateIntroductionAudio(avatar),
      ttsVoiceId: () => this.generateIntroductionAudio(avatar),
    };
  }

  private async generateIntroductionAudio(avatar: Avatar): Promise<void> {
    if (!avatar.introduction) return;

    try {
      const voice = await prisma.ttsVoice.findUnique({ where: { id: avatar.ttsVoiceId } });
      if (!voice) return;
      const provider = await prisma.ttsProvider.findUnique({ where: { id: voice.ttsProviderId } });
      if (!provider) return;

      const result = await tts(avatar.introduction, voice, provider, `${ASSETS_PATH}/audios`);

      // Delete existing audio record for this avatar
      const existing = await prisma.audio.findUnique({ where: { avatarId: avatar.id } });
      if (existing) {
        await prisma.audio.delete({ where: { id: existing.id } });
      }

      // Create new audio record with the filename as ID (without .mp3 extension)
      const audioId = result.fileName!.replace('.mp3', '');
      await prisma.audio.create({
        data: { id: audioId, avatarId: avatar.id },
      });

      console.log(`[avatar] Introduction audio created for ${avatar.name}: ${audioId}`);
    } catch (error: any) {
      console.error(`[avatar] Failed to generate intro audio for ${avatar.name}: ${error.message}`);
    }
  }
}

export const avatarsProcessor = new AvatarsProcessor();
