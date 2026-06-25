import * as fs from 'fs';
import * as path from 'path';
import type { TtsVoice, TtsProvider } from '@prisma/client';

const KOKORO_URL = process.env.CIPHERDOLLS_KOKORO_URL ?? 'http://localhost:8880';
const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';

export interface TtsResult {
  characters: number;
  fileName: string | null;
}

export interface TtsOptions {
  onChunk?: (chunk: Buffer) => void;
}

function randomHex(length = 32): string {
  return Array(length).fill(null).map(() => Math.round(Math.random() * 16).toString(16)).join('');
}

async function kokoroTts(text: string, voice: TtsVoice): Promise<Buffer> {
  const response = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      input: text,
      voice: voice.providerVoiceId,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS error (${response.status}) from Kokoro (${KOKORO_URL}), voice ${voice.providerVoiceId}: ${errorText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function kokoroTtsStream(text: string, voice: TtsVoice, onChunk: (chunk: Buffer) => void): Promise<void> {
  const response = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      input: text,
      voice: voice.providerVoiceId,
      response_format: 'pcm',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS error (${response.status}) from Kokoro (${KOKORO_URL}), voice ${voice.providerVoiceId}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('Kokoro stream response has no body');
  }

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) onChunk(Buffer.from(value));
  }
}

/**
 * Generate speech audio from text using Kokoro.
 * When options.onChunk is provided, audio is streamed via the callback
 * and no file is saved to disk (fileName will be null).
 */
export async function tts(
  text: string,
  voice: TtsVoice,
  provider: TtsProvider,
  outputDir: string,
  options?: TtsOptions,
): Promise<TtsResult> {
  const characters = text.length;
  const saveFile = !options?.onChunk;

  if (saveFile) {
    const fullDir = path.isAbsolute(outputDir) ? outputDir : path.join(ASSETS_PATH, outputDir);
    fs.mkdirSync(fullDir, { recursive: true });
  }

  try {
    if (!saveFile) {
      await kokoroTtsStream(text, voice, options!.onChunk!);
      return { characters, fileName: null };
    }

    const audioBuffer = await kokoroTts(text, voice);

    const fullDir = path.isAbsolute(outputDir) ? outputDir : path.join(ASSETS_PATH, outputDir);
    const fileName = `${randomHex()}.mp3`;
    const filePath = path.join(fullDir, fileName);
    fs.writeFileSync(filePath, audioBuffer);
    console.log(`[tts] Generated ${fileName} via ${provider.name} (${characters} chars)`);

    return { characters, fileName };
  } catch (error: any) {
    console.error(`[tts] Failed:`, error);
    throw error;
  }
}
