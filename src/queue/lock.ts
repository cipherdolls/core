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

  // Keep the lock alive while fn runs. The TTL exists so a crashed holder can't
  // wedge the queue — but blockchain sends wait for a receipt and routinely
  // outlive it, and an expired lock lets a second worker in with a stale nonce.
  // Extend it periodically (only while we still own it) instead of widening the
  // TTL, so a dead holder is still released after one TTL.
  const heartbeat = setInterval(() => {
    redisConnection
      .eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) else return 0 end`,
        1,
        lockKey,
        lockValue,
        String(ttlSeconds),
      )
      .catch((err) => console.error(`[lock] failed to extend ${lockKey}: ${err.message}`));
  }, Math.max(1000, Math.floor(ttl / 3)));

  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    // Release only if we still own it (compare-and-delete via Lua)
    await redisConnection.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1,
      lockKey,
      lockValue,
    );
  }
}
