import IORedis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379');

const publisher = new IORedis(REDIS_PORT, REDIS_HOST, {
  maxRetriesPerRequest: null,
});

publisher.on('connect', () => console.log('[redisPubSub] publisher connected'));
publisher.on('error', (err) => console.error(`[redisPubSub] publisher error: ${err.message}`));

function channel(chatId: string): string {
  return `tts:stream:${chatId}`;
}

/** Number of active subscribers on a chat's tts stream channel */
export async function ttsSubscriberCount(chatId: string): Promise<number> {
  const res = (await publisher.pubsub('NUMSUB', channel(chatId))) as [string, number];
  return Number(res?.[1] ?? 0);
}

const SUBSCRIBER_WAIT_MS = parseInt(process.env.TTS_SUBSCRIBER_WAIT_MS ?? '15000');

/** Wait until someone subscribes to the chat's tts stream. Resolves false on timeout. */
export async function waitForTtsSubscriber(chatId: string, timeoutMs = SUBSCRIBER_WAIT_MS, intervalMs = 250): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await ttsSubscriberCount(chatId)) > 0) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export function publishTtsStart(chatId: string, messageId: string, format = 'mp3'): void {
  const payload = Buffer.from(JSON.stringify({ messageId, format }));
  const msg = Buffer.concat([Buffer.from([0x01]), payload]);
  publisher.publish(channel(chatId), msg as unknown as string);
}

export function publishTtsChunk(chatId: string, chunk: Buffer): void {
  const msg = Buffer.concat([Buffer.from([0x02]), chunk]);
  publisher.publish(channel(chatId), msg as unknown as string);
}

export function publishTtsEnd(chatId: string, messageId: string): void {
  const payload = Buffer.from(JSON.stringify({ messageId }));
  const msg = Buffer.concat([Buffer.from([0x03]), payload]);
  publisher.publish(channel(chatId), msg as unknown as string);
}

export function publishTtsError(chatId: string, messageId: string, error: string): void {
  const payload = Buffer.from(JSON.stringify({ messageId, error }));
  const msg = Buffer.concat([Buffer.from([0x04]), payload]);
  publisher.publish(channel(chatId), msg as unknown as string);
}
