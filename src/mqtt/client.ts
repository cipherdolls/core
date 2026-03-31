import mqtt, { MqttClient } from 'mqtt';
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

  client.on('connect', () => {
    console.log(`MQTT client connected to ${brokerUrl}`);
  });

  client.on('error', (err) => {
    console.error('[mqtt] Client error:', err.message);
  });
}

export function publish(topic: string, event: ProcessEvent | ActionEvent): void {
  if (!client) return;
  client.publish(topic, JSON.stringify(event));
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
    resourceAttributes: params.resourceAttributes,
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
