import type { Job } from 'bullmq';
import type { FillerWord } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';
import { tts } from '../tts/tts.helper';
import { deleteAudioFile } from '../audios/audios';

const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';

class FillerWordsProcessor extends BaseProcessor<FillerWord> {
  constructor() {
    super('fillerWord', ['text', 'fileName']);
  }

  protected async getTargets(entity: FillerWord) {
    const avatar = await prisma.avatar.findUnique({ where: { id: entity.avatarId } });
    return { userId: avatar?.userId };
  }

  protected async onCreated(_job: Job, entity: FillerWord): Promise<void> {
    await this.generateAudio(entity);
  }

  protected getFieldHandlers(_job: Job, entity: FillerWord): Record<string, () => Promise<void>> {
    return {
      text: () => this.generateAudio(entity),
    };
  }

  protected async handleDeleted(job: Job): Promise<void> {
    const entity = job.data[this.entityName] as FillerWord;
    const targets = await this.getTargets(entity);
    console.log(`[fillerWord] Deleted ${entity.id}`);
    this.publishStatus(job, targets, 'active');

    const existing = await prisma.audio.findUnique({ where: { fillerWordId: entity.id } });
    if (existing) {
      deleteAudioFile(existing.id);
      console.log(`[fillerWord] Deleted audio file ${existing.id}`);
    }

    this.publishStatus(job, targets, 'completed');
  }

  private async generateAudio(fillerWord: FillerWord): Promise<void> {
    const avatar = await prisma.avatar.findUnique({ where: { id: fillerWord.avatarId } });
    if (!avatar) throw new Error(`Avatar ${fillerWord.avatarId} not found`);

    const ttsVoice = await prisma.ttsVoice.findUnique({ where: { id: avatar.ttsVoiceId } });
    if (!ttsVoice) throw new Error(`TtsVoice ${avatar.ttsVoiceId} not found`);

    const ttsProvider = await prisma.ttsProvider.findUnique({ where: { id: ttsVoice.ttsProviderId } });
    if (!ttsProvider) throw new Error(`TtsProvider ${ttsVoice.ttsProviderId} not found`);

    const result = await tts(fillerWord.text, ttsVoice, ttsProvider, `${ASSETS_PATH}/audios`);

    // Delete existing audio record for this filler word
    const existing = await prisma.audio.findUnique({ where: { fillerWordId: fillerWord.id } });
    if (existing) {
      deleteAudioFile(existing.id);
      await prisma.audio.delete({ where: { id: existing.id } });
    }

    // Create new audio record
    const audioId = result.fileName!.replace('.mp3', '');
    await prisma.audio.create({
      data: { id: audioId, fillerWordId: fillerWord.id },
    });

    console.log(`[fillerWord] Audio created for "${fillerWord.text}": ${audioId}`);
  }
}

export const fillerWordsProcessor = new FillerWordsProcessor();
