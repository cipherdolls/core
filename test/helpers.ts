import { ethers } from 'ethers';
import IORedis from 'ioredis';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
export type { MqttClient };

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';
export const MQTT_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://core:1883';
const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379');

/**
 * Wait until all BullMQ queues in Redis are empty (no waiting, active, or delayed jobs)
 * AND stay empty for `settleMs` to avoid false positives when one job completes
 * and immediately enqueues the next (e.g. STT → chatCompletion).
 * After queues are confirmed empty, waits an additional `mqttPropagationMs`
 * for MQTT events to be delivered to subscribers.
 */
export async function waitForQueuesEmpty(timeout = 30000, settleMs = 1000, mqttPropagationMs = 500): Promise<void> {
  const redis = new IORedis(REDIS_PORT, REDIS_HOST, { maxRetriesPerRequest: null });
  const interval = 200;
  let elapsed = 0;
  let emptyFor = 0;

  try {
    while (elapsed < timeout) {
      const keys = await redis.keys('bull:*:waiting');
      const activeKeys = await redis.keys('bull:*:active');
      const delayedKeys = await redis.keys('bull:*:delayed');

      let totalJobs = 0;
      for (const key of [...keys, ...activeKeys, ...delayedKeys]) {
        const type = await redis.type(key);
        if (type === 'list') totalJobs += await redis.llen(key);
        else if (type === 'zset') totalJobs += await redis.zcard(key);
      }

      if (totalJobs === 0) {
        emptyFor += interval;
        if (emptyFor >= settleMs) {
          await new Promise((r) => setTimeout(r, mqttPropagationMs));
          return;
        }
      } else {
        emptyFor = 0;
      }

      await new Promise((r) => setTimeout(r, interval));
      elapsed += interval;
    }
    throw new Error(`Queues not empty after ${timeout}ms`);
  } finally {
    redis.disconnect();
  }
}

/**
 * Wait until a queue array has at least `expectedCount` items.
 * Use this for events produced outside BullMQ (e.g. blockchain watcher).
 * Prefer waitForQueuesEmpty for BullMQ-driven events.
 */
export function waitForEvents<T>(queue: T[], expectedCount: number, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const interval = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      if (queue.length >= expectedCount) { clearInterval(timer); resolve(); }
      elapsed += interval;
      if (elapsed >= timeout) { clearInterval(timer); reject(new Error(`Timed out waiting for ${expectedCount} events, got ${queue.length}`)); }
    }, interval);
  });
}

const VALID_JOB_STATUSES = new Set(['active', 'completed', 'failed', 'retrying']);

/**
 * Assert that every ProcessEvent in the array has a valid structure.
 * Call before clearing event arrays to ensure nothing was silently dropped or malformed.
 */
export function assertValidProcessEvents(events: ProcessEvent[]): void {
  for (const e of events) {
    if (!e.resourceName || typeof e.resourceName !== 'string') throw new Error(`Invalid resourceName: ${JSON.stringify(e)}`);
    if (!e.resourceId) throw new Error(`Missing resourceId: ${JSON.stringify(e)}`);
    if (!VALID_JOB_STATUSES.has(e.jobStatus)) throw new Error(`Invalid jobStatus "${e.jobStatus}": ${JSON.stringify(e)}`);
  }
}

// Anvil deterministic wallets
export const wallets = {
  admin: { address: process.env.MASTER_WALLET_ADDRESS!, pk: process.env.MASTER_WALLET_PRIVATE_KEY! },
  alice: { address: process.env.ALICE_WALLET_ADDRESS!, pk: process.env.ALICE_WALLET_PRIVATE_KEY! },
  bob: { address: process.env.BOB_WALLET_ADDRESS!, pk: process.env.BOB_WALLET_PRIVATE_KEY! },
  guest: { address: process.env.GUEST_WALLET_ADDRESS!, pk: process.env.GUEST_WALLET_PRIVATE_KEY! },
};

export interface AuthData {
  jwt: string;
  apiKey: string;
  userId: string;
  signerAddress: string;
}

export const auth: Record<string, AuthData> = {
  admin: { jwt: '', apiKey: '', userId: '', signerAddress: '' },
  alice: { jwt: '', apiKey: '', userId: '', signerAddress: '' },
  bob: { jwt: '', apiKey: '', userId: '', signerAddress: '' },
  guest: { jwt: '', apiKey: '', userId: '', signerAddress: '' },
};

/* ── Auth helpers ─────────────────────────────────────────────── */

export async function signIn(pk: string, address: string, opts?: { name?: string; gender?: string; language?: string; invitedBy?: string }): Promise<string> {
  const nonceRes = await fetch(`${BASE_URL}/auth/nonce`);
  const { nonce } = (await nonceRes.json()) as any;
  const message = `I am signing this message to prove my identity. Nonce: ${nonce}`;
  const wallet = new ethers.Wallet(pk);
  const signedMessage = await wallet.signMessage(message);
  const query = opts?.invitedBy ? `?invitedBy=${opts.invitedBy}` : '';
  const res = await fetch(`${BASE_URL}/auth/signin${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedMessage, message, address, ...opts }),
  });
  const body = (await res.json()) as any;
  if (!body.token) throw new Error(`signIn failed: ${JSON.stringify(body)}`);
  return body.token;
}

export async function createApiKey(jwt: string, name: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ name }),
  });
  const body = (await res.json()) as any;
  return body.key;
}

/* ── HTTP helpers ─────────────────────────────────────────────── */

export async function api(method: string, path: string, jwt: string, body?: any): Promise<{ status: number; body: any }> {
  const opts: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  return { status: res.status, body: await res.json() };
}

export async function get(path: string, jwt?: string): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return { status: res.status, body: await res.json() };
}

/* ── MQTT helpers ─────────────────────────────────────────────── */

export type ProcessEvent = {
  resourceName: string;
  resourceId: string;
  resourceAttributes?: Record<string, any>;
  jobName: string;
  jobId: number;
  jobStatus: 'active' | 'completed' | 'failed' | 'retrying';
};

export function connectMqtt(password: string): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(MQTT_URL, { username: '', password });
    client.on('connect', () => resolve(client));
    client.on('error', (err) => reject(err));
    setTimeout(() => reject(new Error('MQTT connect timeout')), 5000);
  });
}

export function subscribeTopic(client: MqttClient, topic: string): ProcessEvent[] {
  const events: ProcessEvent[] = [];
  client.subscribe(topic);
  client.on('message', (t, msg) => {
    if (t === topic) {
      events.push(JSON.parse(msg.toString()));
    }
  });
  return events;
}

export function groupByResourceName(events: ProcessEvent[]): Record<string, ProcessEvent[]> {
  const result: Record<string, ProcessEvent[]> = {};
  for (const e of events) {
    (result[e.resourceName] ??= []).push(e);
  }
  return result;
}
