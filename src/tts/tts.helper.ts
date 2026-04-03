import * as fs from 'fs';
import * as path from 'path';
import type { TtsVoice, TtsProvider } from '@prisma/client';

const KOKORO_URL = process.env.CIPHERDOLLS_KOKORO_URL ?? 'http://localhost:8880';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? '';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY ?? '';
const UNREALSPEECH_API_KEY = process.env.UNREALSPEECH_API_KEY ?? '';
const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';

export interface TtsResult {
  characters: number;
  fileName: string | null;
  usdCost: number;
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

async function elevenlabsTts(text: string, voice: TtsVoice): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.providerVoiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',
      output_format: 'mp3_44100_128',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS error (${response.status}) from ElevenLabs, voice ${voice.providerVoiceId}: ${errorText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function elevenlabsTtsStream(text: string, voice: TtsVoice, onChunk: (chunk: Buffer) => void): Promise<void> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice.providerVoiceId}/stream?output_format=pcm_24000`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS error (${response.status}) from ElevenLabs, voice ${voice.providerVoiceId}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('ElevenLabs stream response has no body');
  }

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) onChunk(Buffer.from(value));
  }
}

async function minimaxTts(text: string, voice: TtsVoice): Promise<Buffer> {
  const response = await fetch('https://api.minimaxi.chat/v1/t2a_v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'speech-02-hd',
      text,
      voice_setting: { voice_id: voice.providerVoiceId },
      audio_setting: { format: 'mp3', sample_rate: 32000 },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS error (${response.status}) from MiniMax, voice ${voice.providerVoiceId}: ${errorText}`);
  }

  const data = await response.json() as any;
  if (data.base_resp?.status_code !== 0) {
    throw new Error(`TTS error from MiniMax, voice ${voice.providerVoiceId}: ${data.base_resp?.status_msg}`);
  }

  const audioHex = data.data?.audio;
  if (!audioHex) throw new Error('MiniMax returned no audio data');
  return Buffer.from(audioHex, 'hex');
}

async function unrealSpeechTts(text: string, voice: TtsVoice): Promise<Buffer> {
  const response = await fetch('https://api.v7.unrealspeech.com/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${UNREALSPEECH_API_KEY}`,
    },
    body: JSON.stringify({
      Text: text,
      VoiceId: voice.providerVoiceId,
      Bitrate: '128k',
      OutputFormat: 'mp3',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS error (${response.status}) from UnrealSpeech, voice ${voice.providerVoiceId}: ${errorText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Generate speech audio from text using the configured TTS provider.
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
  const usdCost = characters * Number(provider.dollarPerCharacter);
  const saveFile = !options?.onChunk;

  if (saveFile) {
    const fullDir = path.isAbsolute(outputDir) ? outputDir : path.join(ASSETS_PATH, outputDir);
    fs.mkdirSync(fullDir, { recursive: true });
  }

  try {
    const name = provider.name.toLowerCase();
    const isElevenLabs = name.includes('elevenlabs') || name.includes('eleven');
    const isKokoro = name.includes('kokoro');

    // Stream chunks directly for providers that support it
    if (!saveFile && isElevenLabs) {
      await elevenlabsTtsStream(text, voice, options!.onChunk!);
      return { characters, fileName: null, usdCost };
    }

    if (!saveFile && isKokoro) {
      await kokoroTtsStream(text, voice, options!.onChunk!);
      return { characters, fileName: null, usdCost };
    }

    let audioBuffer: Buffer;

    if (name.includes('kokoro')) {
      audioBuffer = await kokoroTts(text, voice);
    } else if (isElevenLabs) {
      audioBuffer = await elevenlabsTts(text, voice);
    } else if (name.includes('minimax')) {
      audioBuffer = await minimaxTts(text, voice);
    } else if (name.includes('unrealspeech') || name.includes('unreal')) {
      audioBuffer = await unrealSpeechTts(text, voice);
    } else {
      throw new Error(`Unknown TTS provider: ${provider.name}`);
    }

    if (!saveFile) {
      options!.onChunk!(audioBuffer);
      return { characters, fileName: null, usdCost };
    }

    const fullDir = path.isAbsolute(outputDir) ? outputDir : path.join(ASSETS_PATH, outputDir);
    const fileName = `${randomHex()}.mp3`;
    const filePath = path.join(fullDir, fileName);
    fs.writeFileSync(filePath, audioBuffer);
    console.log(`[tts] Generated ${fileName} via ${provider.name} (${characters} chars, $${usdCost.toFixed(6)})`);

    return { characters, fileName, usdCost };
  } catch (error: any) {
    console.error(`[tts] Failed:`, error);
    throw error;
  }
}
