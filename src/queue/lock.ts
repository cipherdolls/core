import { redisConnection } from './connection';
import { randomUUID } from 'crypto';

const DEFAULT_TTL = 30_000; // 30s max hold time
const RETRY_INTERVAL = 50;  // retry every 50ms

/**
 * Distributed Redis lock using SET NX EX.
 * Ensures only one worker across all replicas holds the lock at a time.
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  ttl = DEFAULT_TTL,
): Promise<T> {
  const lockKey = `lock:${key}`;
  const lockValue = randomUUID();
  const ttlSeconds = Math.ceil(ttl / 1000);

  // Acquire
  while (true) {
    const acquired = await redisConnection.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');
    if (acquired === 'OK') break;
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL));
  }

  try {
    return await fn();
  } finally {
    // Release only if we still own it (compare-and-delete via Lua)
    await redisConnection.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1,
      lockKey,
      lockValue,
    );
  }
}
