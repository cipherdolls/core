import type { Job } from 'bullmq';
import type { SttJob, Message, SttProvider } from '@prisma/client';
import { Prisma, LanguageCode } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';

const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';
const WHISPER_URL = process.env.WHISPER_URL ?? 'http://localhost:9000';
const MESSAGES_DIR = path.join(ASSETS_PATH, 'messages');

interface WhisperResponse {
  text: string;
  segments: { start: number; end: number }[];
}

function getTotalTime(response: WhisperResponse): number {
  return response.segments.reduce((acc, s) => acc + (s.end - s.start), 0);
}

async function sttWhisperLocal(filePath: string, language: LanguageCode, baseUrl: string): Promise<WhisperResponse> {
  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append('audio_file', new File([fileBuffer], path.basename(filePath), { type: 'audio/mpeg' }));

  const url = new URL(`${baseUrl}/asr`);
  url.searchParams.append('encode', 'true');
  url.searchParams.append('task', 'transcribe');
  url.searchParams.append('word_timestamps', 'true');
  url.searchParams.append('output', 'json');
  url.searchParams.append('language', language);

  const response = await fetch(url.toString(), { method: 'POST', body: formData });
  if (!response.ok) throw new Error(`Whisper error (${response.status}): ${await response.text()}`);
  return response.json() as Promise<WhisperResponse>;
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

async function stt(message: Message, sttProvider: SttProvider, language: LanguageCode): Promise<{ content: string; audioSeconds: number; usdCost: number }> {
  const filePath = path.join(MESSAGES_DIR, message.fileName!);
  let whisperResponse: WhisperResponse;

  switch (sttProvider.name) {
    case 'GroqWhisper':
      whisperResponse = await sttGroq(filePath, language, 'whisper-large-v3');
      break;
    case 'GroqWhisperLargeV3En':
      whisperResponse = await sttGroq(filePath, language, 'distil-whisper-large-v3-en');
      break;
    case 'GroqWhisperLargeV3Turbo':
      whisperResponse = await sttGroq(filePath, language, 'whisper-large-v3-turbo');
      break;
    case 'CipherdollsWhisper':
      whisperResponse = await sttWhisperLocal(filePath, language, 'https://whisper.ffaerber.duckdns.org');
      break;
    case 'LocalWhisper':
      whisperResponse = await sttWhisperLocal(filePath, language, WHISPER_URL);
      break;
    default:
      throw new Error(`Unknown STT provider: ${sttProvider.name}`);
  }

  const audioSeconds = getTotalTime(whisperResponse);
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
      // Update the message with transcribed content
      await model.message.update({
        where: { id: message.id },
        data: { content: result.content, completed: true },
      }, message);

      // Trigger chat completion + embedding for the transcribed text
      await model.chatCompletionJob.create({
        data: {
          chat: { connect: { id: message.chatId } },
          message: { connect: { id: message.id } },
        },
      });

      await model.embeddingJob.create({
        data: {
          message: { connect: { id: message.id } },
        },
      });
    }

    // Update STT job with metrics
    await model.sttJob.update({
      where: { id: sttJob.id },
      data: { timeTakenMs, audioSeconds: result.audioSeconds, usdCost: result.usdCost },
    }, sttJob);
  }

  protected override getFieldHandlers(_job: Job, _entity: SttJob): Record<string, () => Promise<void>> {
    return {};
  }
}

export const sttJobsProcessor = new SttJobsProcessor();
