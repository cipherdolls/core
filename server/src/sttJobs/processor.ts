import type { Job } from 'bullmq';
import type { SttJob, Message, SttProvider } from '@prisma/client';
import { Prisma, LanguageCode } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';

const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';
const MESSAGES_DIR = path.join(ASSETS_PATH, 'messages');

interface WhisperResponse {
  text: string;
  segments: { start: number; end: number }[];
}

function getTotalTime(response: WhisperResponse): number {
  return response.segments.reduce((acc, s) => acc + (s.end - s.start), 0);
}

async function sttGroq(filePath: string, language: LanguageCode, model: string): Promise<WhisperResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append('file', new File([fileBuffer], path.basename(filePath), { type: 'audio/mpeg' }));
  formData.append('model', model);
  formData.append('temperature', '0');
  formData.append('response_format', 'verbose_json');
  formData.append('language', language);

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `bearer ${apiKey}` },
    body: formData,
  });
  if (!response.ok) throw new Error(`Groq Whisper error (${response.status}): ${await response.text()}`);
  return response.json() as Promise<WhisperResponse>;
}

async function stt(message: Message, sttProvider: SttProvider, language: LanguageCode): Promise<{ content: string; audioSeconds: number }> {
  const filePath = path.join(MESSAGES_DIR, message.fileName!);

  // Single supported provider: Groq Whisper.
  const whisperResponse = await sttGroq(filePath, language, 'whisper-large-v3');

  const audioSeconds = getTotalTime(whisperResponse);
  return { content: whisperResponse.text, audioSeconds };
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
      await model.message.create({
        data: {
          user: { connect: { id: message.userId } },
          chat: { connect: { id: message.chatId } },
          role: 'SYSTEM',
          content: 'Speech to text failed. The audio did not contain any speech to transcribe. Ask user if he can repeat what he said.',
          completed: true,
        },
      });
    } else {
      await model.message.update({
        where: { id: message.id },
        data: { content: result.content, completed: true },
      }, message);

      await model.chatCompletion.create({
        data: {
          chat: { connect: { id: message.chatId } },
          message: { connect: { id: message.id } },
        },
      });
    }

    await model.sttJob.update({
      where: { id: sttJob.id },
      data: { timeTakenMs, audioSeconds: result.audioSeconds },
    }, sttJob);
  }
}

export const sttJobsProcessor = new SttJobsProcessor();
