import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import sharp from 'sharp';

const UPLOADS_DIR = './uploads/pictures';

/** Ensure the upload directory exists */
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Save an uploaded picture file: resize to 2000px WebP.
 * Returns the picture ID (random 32-char hex string) used as the base filename.
 */
export async function savePicture(file: File): Promise<string> {
  ensureDir(UPLOADS_DIR);
  const pictureId = crypto.randomBytes(16).toString('hex');
  const buffer = Buffer.from(await file.arrayBuffer());

  await sharp(buffer).webp().resize(2000).toFile(`${UPLOADS_DIR}/${pictureId}-2000.webp`);

  return pictureId;
}

/**
 * Serve a picture with on-demand resize and caching.
 * Returns a Response with the image data.
 */
export async function servePicture(
  pictureId: string,
  x: number,
  y: number,
  format: 'webp' | 'jpeg',
): Promise<Response> {
  const ext = format === 'jpeg' ? 'jpg' : 'webp';
  // "-b" = top-biased crop; distinct from older center/attention cache files.
  const cachedPath = `${UPLOADS_DIR}/${pictureId}-${x}-${y}-b.${ext}`;
  const sourcePath = `${UPLOADS_DIR}/${pictureId}-2000.webp`;

  if (!fs.existsSync(sourcePath)) {
    return new Response(JSON.stringify({ error: 'Picture file not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!fs.existsSync(cachedPath)) {
    // Top-biased cover crop. Faces sit in the upper part of portrait images, so a
    // centered crop to a wider aspect cuts them off — and saliency ("attention")
    // gets dragged to high-contrast clothing on stylized art. Deterministic rule:
    // center horizontally, but never start the crop below ~15% of the height.
    const meta = await sharp(sourcePath).metadata();
    const srcW = meta.width ?? x;
    const srcH = meta.height ?? y;
    const scale = Math.max(x / srcW, y / srcH);
    const scaledW = Math.max(x, Math.round(srcW * scale));
    const scaledH = Math.max(y, Math.round(srcH * scale));
    const left = Math.round((scaledW - x) / 2);
    const top = Math.min(Math.round((scaledH - y) / 2), Math.round(0.15 * scaledH));
    const pipeline = sharp(sourcePath)
      .resize(scaledW, scaledH)
      .extract({ left, top, width: x, height: y });
    if (format === 'jpeg') {
      await pipeline.jpeg({ quality: 80 }).toFile(cachedPath);
    } else {
      await pipeline.webp().toFile(cachedPath);
    }
  }

  const fileBuffer = fs.readFileSync(cachedPath);
  const contentType = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
  return new Response(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="picture.${ext}"`,
    },
  });
}
