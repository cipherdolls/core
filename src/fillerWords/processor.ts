import type { Job } from 'bullmq';
import type { FillerWord } from '@prisma/client';
import * as path from 'path';
import * as fs from 'node:fs';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';
import { tts } from '../tts/tts.helper';

const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';
const FILLER_WORDS_DIR = path.join(ASSETS_PATH, 'fillerWords');

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

    if (entity.fileName) {
      const filePath = path.join(FILLER_WORDS_DIR, entity.fileName);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[fillerWord] Deleted audio file ${filePath}`);
        }
      } catch (error: any) {
        console.warn(`[fillerWord] Failed to delete audio file: ${error.message}`);
      }
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

    const result = await tts(fillerWord.text, ttsVoice, ttsProvider, FILLER_WORDS_DIR);

    const original = await prisma.fillerWord.findUnique({ where: { id: fillerWord.id } });
    const updated = await prisma.fillerWord.update({
      where: { id: fillerWord.id },
      data: { fileName: result.fileName },
    });

    // Enqueue the fileName update so MQTT events fire
    const { enqueueUpdated } = await import('../queue/enqueue');
    await enqueueUpdated('fillerWord', updated, original);
  }
}

export const fillerWordsProcessor = new FillerWordsProcessor();
