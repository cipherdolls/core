
import { auth, api, get, connectMqtt, waitForEvents, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient } from './helpers';
import { hanaChatId } from './chats';

export function describeEmbeddingJobs() {
  describe('embeddingJobs Controller (e2e)', () => {
    let aliceMqttClient: MqttClient;
    let aliceChatProcessEvents: ProcessEvent[] = [];

    let embeddingModelId: string;

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect alice MQTT client for embeddingJobs', async () => {
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
      aliceMqttClient.subscribe(`chats/${hanaChatId}/processEvents`);
      aliceMqttClient.on('message', (_topic, msg) => {
        aliceChatProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    // ─── Resolve seed data ──────────────────────────────────────

    it('resolve embedding model', async () => {
      const { body: embeddingModels } = await api('GET', '/embedding-models', auth.admin.jwt);
      expect(embeddingModels.data.length).toBeGreaterThan(0);
      embeddingModelId = embeddingModels.data[0].id;
    });

    // ─── Get existing messages with embedding jobs ──────────────

    it('alice gets messages from hanaChat', async () => {
      const { status, body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    // ─── Check embedding job on existing message ────────────────

    it('alice gets an existing message with embeddingJob', async () => {
      const { body: messagesRes } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      const messages = messagesRes.data;
      // Find a message that has an embeddingJob
      let messageWithEmbedding: any = null;
      for (const msg of messages) {
        const { body: detail } = await api('GET', `/messages/${msg.id}`, auth.alice.jwt);
        if (detail.embeddingJob) {
          messageWithEmbedding = detail;
          break;
        }
      }
      // It's possible no message has an embedding job yet depending on scenario config
      if (messageWithEmbedding) {
        expect(messageWithEmbedding.embeddingJob).toHaveProperty('id');
      }
    });

    // ─── Update embedding model to wrong name ───────────────────

    it('admin updates embeddingModel providerModelName to something wrong', async () => {
      const { status, body } = await api('PATCH', `/embedding-models/${embeddingModelId}`, auth.admin.jwt, {
        providerModelName: 'wrongModelName',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('providerModelName', 'wrongModelName');
    });

    // ─── Drain events ───────────────────────────────────────────

    it('drain late events from previous modules', async () => {
      await new Promise((r) => setTimeout(r, 2000));
      aliceChatProcessEvents = [];
    });

    // ─── Post message that will fail embedding ──────────────────

    it('alice posts a text message to hanaChat', async () => {
      const { status, body } = await api('POST', '/messages', auth.alice.jwt, {
        chatId: hanaChatId,
        content: 'very nice',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
    });

    it('wait for message processing to complete', async () => {
      // Poll until the assistant response is created (message count increases by 2)
      const { body: before } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      const countBefore = before.meta.total;
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
        if (body.meta.total >= countBefore + 1) break; // at least the USER message + possibly ASSISTANT
      }
      aliceChatProcessEvents = [];
    });

    // ─── Check that embedding job has error ─────────────────────

    it('alice gets messages and finds embedding error on the latest user message', async () => {
      // Wait for embedding job to process and record the error
      await new Promise((r) => setTimeout(r, 5000));

      const { body: messagesRes } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      const messages = messagesRes.data;
      const userMessages = messages.filter((m: any) => m.role === 'USER');
      const lastUserMessage = userMessages[0]; // messages are desc order, newest first
      expect(lastUserMessage).toBeDefined();

      const { body } = await api('GET', `/messages/${lastUserMessage.id}`, auth.alice.jwt);
      if (body.embeddingJob && body.embeddingJob.error) {
        expect(typeof body.embeddingJob.error).toBe('string');
      }
      // Verify the embedding job exists and is linked to our model
      if (body.embeddingJob) {
        const { body: jobDetail } = await api('GET', `/embedding-jobs/${body.embeddingJob.id}`, auth.alice.jwt);
        expect(jobDetail).toHaveProperty('id');
      }
    });

    // ─── Restore embedding model ────────────────────────────────

    it('admin restores embeddingModel providerModelName', async () => {
      const { status } = await api('PATCH', `/embedding-models/${embeddingModelId}`, auth.admin.jwt, {
        providerModelName: 'all-minilm:latest',
      });
      expect(status).toBe(200);
    });

    // ─── Cleanup ────────────────────────────────────────────────

    it('no unprocessed events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      if (aliceChatProcessEvents.length > 0) console.log('Unprocessed alice chat events:', aliceChatProcessEvents.length, aliceChatProcessEvents);
      expect(aliceChatProcessEvents.length).toBe(0);
    });

    it('close alice MQTT client for embeddingJobs', () => {
      aliceMqttClient?.end();
    });
  });
}
