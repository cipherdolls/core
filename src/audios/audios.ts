import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

const UPLOADS_DIR = './uploads/audios';

/** Ensure the upload directory exists */
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Save an uploaded audio file.
 * Returns the audio ID (random 32-char hex string) used as the base filename.
 */
export async function saveAudio(file: File): Promise<string> {
  ensureDir(UPLOADS_DIR);
  const audioId = crypto.randomBytes(16).toString('hex');
  const buffer = Buffer.from(await file.arrayBuffer());

  fs.writeFileSync(`${UPLOADS_DIR}/${audioId}.mp3`, buffer);

  return audioId;
}

/**
 * Serve an audio file by its ID.
 * Returns a Response streaming the audio data.
 */
export function serveAudio(audioId: string): Response {
  const filePath = `${UPLOADS_DIR}/${audioId}.mp3`;

  if (!fs.existsSync(filePath)) {
    return new Response(JSON.stringify({ error: 'Audio file not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const fileBuffer = fs.readFileSync(filePath);
  return new Response(fileBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'attachment; filename="audio.mp3"',
      'Cache-Control': 'no-cache',
    },
  });
}

/**
 * Delete an audio file by its ID.
 */
export function deleteAudioFile(audioId: string): void {
  const filePath = `${UPLOADS_DIR}/${audioId}.mp3`;
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
