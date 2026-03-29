import { ethers } from 'ethers';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
export type { MqttClient };

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';
export const MQTT_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://core:1883';

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

export function groupByResourceName(events: ProcessEvent[]): Record<string, ProcessEvent[]> {
  const result: Record<string, ProcessEvent[]> = {};
  for (const e of events) {
    (result[e.resourceName] ??= []).push(e);
  }
  return result;
}
