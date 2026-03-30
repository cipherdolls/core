import type { Job } from 'bullmq';
import type { SttJob, Message, SttProvider } from '@prisma/client';
import { Prisma, LanguageCode } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';
import { enqueueCreated, enqueueUpdated } from '../queue/enqueue';

const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';
const WHISPER_URL = process.env.WHISPER_URL ?? 'http://localhost:9000';
const MESSAGES_DIR = path.join(ASSETS_PATH, 'messages');

interface WhisperResponse {
  text: string;
  segments: { start: number; end: number }[];
}

async function stt(message: Message, sttProvider: SttProvider, language: LanguageCode): Promise<{ content: string; audioSeconds: number; usdCost: number }> {
  const filePath = path.join(MESSAGES_DIR, message.fileName!);

  const formData = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  formData.append('audio_file', new File([fileBuffer], message.fileName!, { type: 'audio/mpeg' }));

  const url = new URL(`${WHISPER_URL}/asr`);
  url.searchParams.append('encode', 'true');
  url.searchParams.append('task', 'transcribe');
  url.searchParams.append('word_timestamps', 'true');
  url.searchParams.append('output', 'json');
  url.searchParams.append('language', language);

  const response = await fetch(url.toString(), { method: 'POST', body: formData });
  if (!response.ok) throw new Error(`Whisper error (${response.status}): ${await response.text()}`);

  const whisperResponse = await response.json() as WhisperResponse;
  const audioSeconds = whisperResponse.segments.reduce((acc, s) => acc + (s.end - s.start), 0);
  const usdCost = Number(sttProvider.dollarPerSecond) * audioSeconds;

  return { content: whisperResponse.text, audioSeconds, usdCost };
}

const scalarFields = Object.values(Prisma.SttJobScalarFieldEnum) as string[];

class SttJobsProcessor extends BaseProcessor<SttJob> {
  constructor() {
    super('sttJob', scalarFields);
  }

  protected override async getTargets(entity: SttJob) {
    const message = await prisma.message.findUnique({ where: { id: entity.messageId }, include: { chat: true } });
    return { userId: message?.chat?.userId, chatId: message?.chatId };
  }

  protected override async onCreated(_job: Job, sttJob: SttJob): Promise<void> {
    const startTime = Date.now();

    const message = await prisma.message.findUnique({ where: { id: sttJob.messageId } });
    if (!message || !message.fileName) throw new Error(`Message ${sttJob.messageId} has no audio file`);

    const chat = await prisma.chat.findUnique({ where: { id: message.chatId } });
    if (!chat?.sttProviderId) throw new Error(`Chat ${message.chatId} has no STT provider`);

    const sttProvider = await prisma.sttProvider.findUnique({ where: { id: chat.sttProviderId } });
    if (!sttProvider) throw new Error(`STT provider ${chat.sttProviderId} not found`);

    const user = await prisma.user.findUnique({ where: { id: message.userId } });

    const result = await stt(message, sttProvider, user?.language ?? 'en');
    const timeTakenMs = Date.now() - startTime;

    if (result.content === '') {
      // No speech detected - create a system message
      const systemMsg = await prisma.message.create({
        data: {
          user: { connect: { id: message.userId } },
          chat: { connect: { id: message.chatId } },
          role: 'SYSTEM',
          content: 'Speech to text failed. The audio did not contain any speech to transcribe. Ask user if he can repeat what he said.',
          completed: true,
        },
      });
      await enqueueCreated('message', systemMsg);
    } else {
      // Update the message with transcribed content
      await prisma.message.update({
        where: { id: message.id },
        data: { content: result.content, completed: true },
      });

      // Trigger chat completion + embedding for the transcribed text
      const ccJob = await prisma.chatCompletionJob.create({
        data: {
          chat: { connect: { id: message.chatId } },
          message: { connect: { id: message.id } },
        },
      });
      await enqueueCreated('chatCompletionJob', ccJob);

      const embeddingJob = await prisma.embeddingJob.create({
        data: {
          message: { connect: { id: message.id } },
        },
      });
      await enqueueCreated('embeddingJob', embeddingJob);
    }

    // Update STT job with metrics
    const original = await prisma.sttJob.findUnique({ where: { id: sttJob.id } });
    const updated = await prisma.sttJob.update({
      where: { id: sttJob.id },
      data: { timeTakenMs, audioSeconds: result.audioSeconds, usdCost: result.usdCost },
    });
    await enqueueUpdated('sttJob', updated, original);
  }

  protected override getFieldHandlers(_job: Job, _entity: SttJob): Record<string, () => Promise<void>> {
    return {};
  }
}

export const sttJobsProcessor = new SttJobsProcessor();
