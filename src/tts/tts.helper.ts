import * as fs from 'fs';
import * as path from 'path';
import type { TtsVoice, TtsProvider } from '@prisma/client';

const KOKORO_URL = process.env.CIPHERDOLLS_KOKORO_URL ?? 'http://localhost:8880';
const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';

export interface TtsResult {
  characters: number;
  fileName: string | null;
  usdCost: number;
}

function randomHex(length = 32): string {
  return Array(length).fill(null).map(() => Math.round(Math.random() * 16).toString(16)).join('');
}

/**
 * Generate speech audio from text using the configured TTS provider.
 * Currently supports CipherdollsKokoro (OpenAI-compatible endpoint).
 */
export async function tts(
  text: string,
  voice: TtsVoice,
  provider: TtsProvider,
  outputDir: string,
): Promise<TtsResult> {
  const characters = text.length;
  const usdCost = characters * Number(provider.dollarPerCharacter);

  // Ensure output directory exists
  const fullDir = path.isAbsolute(outputDir) ? outputDir : path.join(ASSETS_PATH, outputDir);
  fs.mkdirSync(fullDir, { recursive: true });

  const fileName = `${randomHex()}.mp3`;
  const filePath = path.join(fullDir, fileName);

  try {
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
      throw new Error(`TTS API error (${response.status}): ${errorText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, audioBuffer);

    console.log(`[tts] Generated ${fileName} (${characters} chars, $${usdCost.toFixed(6)})`);

    return { characters, fileName, usdCost };
  } catch (error: any) {
    console.error(`[tts] Failed: ${error.message}`);
    throw error;
  }
}
