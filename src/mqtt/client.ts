import mqtt, { MqttClient } from 'mqtt';
import { Decimal } from '@prisma/client/runtime/library';
import type { ProcessEvent, ActionEvent } from './types';

let client: MqttClient;

export function getMqttClient(): MqttClient {
  return client;
}

export function startMqttClient() {
  const brokerUrl = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
  const brokerKey = process.env.MQTT_BROKER_KEY ?? '';

  client = mqtt.connect(brokerUrl, {
    clientId: `core_${Math.random().toString(16).slice(3)}`,
    username: 'core',
    password: brokerKey,
    reconnectPeriod: 1000,
    connectTimeout: 10000,
  });

  let lastErrorMsg = '';
  let errorCount = 0;

  client.on('connect', () => {
    if (errorCount > 0) {
      console.log(`[mqtt] Reconnected to ${brokerUrl} after ${errorCount} failed attempts`);
    } else {
      console.log(`[mqtt] Connected to ${brokerUrl}`);
    }
    lastErrorMsg = '';
    errorCount = 0;
  });

  client.on('offline', () => {
    console.warn(`[mqtt] Client offline, will retry...`);
  });

  console.log(`[mqtt] Connecting to ${brokerUrl}`);

  client.on('error', (err) => {
    errorCount++;
    if (err.message !== lastErrorMsg) {
      console.error(`[mqtt] Client error (${brokerUrl}): ${err.message}`);
      lastErrorMsg = err.message;
    } else if (errorCount % 30 === 0) {
      console.error(`[mqtt] Still failing after ${errorCount} attempts: ${err.message}`);
    }
  });
}

export function publish(topic: string, event: ProcessEvent | ActionEvent): void {
  if (!client) return;
  client.publish(topic, JSON.stringify(event, (_key, value) => {
    if (value instanceof Decimal) return value.toNumber();
    return value;
  }));
}

/**
 * Convert Prisma Decimal values (both instances and deserialized { s, e, d } objects)
 * to plain numbers so they serialize correctly over MQTT.
 *
 * decimal.js internal format: s=sign(1/-1), e=exponent, d=digits array (base 1e7)
 * e.g. { s:1, e:0, d:[3,9914350] } → 3.9914350
 */
function sanitizeAttributes(attrs?: Record<string, any>): Record<string, any> | undefined {
  if (!attrs) return attrs;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value instanceof Decimal) {
      result[key] = value.toNumber();
    } else if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof value.s === 'number' &&
      typeof value.e === 'number' &&
      Array.isArray(value.d)
    ) {
      const digits = value.d
        .map((n: number, i: number) => (i === 0 ? String(n) : String(n).padStart(7, '0')))
        .join('');
      const intDigits = value.e + 1;
      let numStr: string;
      if (intDigits >= digits.length) {
        numStr = digits + '0'.repeat(intDigits - digits.length);
      } else if (intDigits <= 0) {
        numStr = '0.' + '0'.repeat(-intDigits) + digits;
      } else {
        numStr = digits.slice(0, intDigits) + '.' + digits.slice(intDigits);
      }
      result[key] = value.s * Number(numStr);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function publishProcessEvent(params: {
  jobName: string;
  jobId: number;
  targets: { userId?: string | number; dollId?: string | number; chatId?: string | number };
  resourceName: string;
  resourceId: string;
  jobStatus?: ProcessEvent['jobStatus'];
  resourceAttributes?: Record<string, any>;
}): void {
  const event: ProcessEvent = {
    resourceName: params.resourceName,
    resourceId: String(params.resourceId),
    jobName: params.jobName,
    jobId: params.jobId,
    jobStatus: params.jobStatus ?? 'active',
    resourceAttributes: sanitizeAttributes(params.resourceAttributes),
  };

  const topics: string[] = [];
  if (params.targets.userId) topics.push(`users/${params.targets.userId}/processEvents`);
  if (params.targets.dollId) topics.push(`dolls/${params.targets.dollId}/processEvents`);
  if (params.targets.chatId) topics.push(`chats/${params.targets.chatId}/processEvents`);

  for (const t of topics) publish(t, event);
}

export function stopMqttClient() {
  client?.end();
}
