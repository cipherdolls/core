
import { auth, api, get, connectMqtt, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient } from './helpers';

// Module-level ID for cross-test imports
export let embeddingModelId: string;

export function describeEmbeddingModels() {
  describe('EmbeddingModels', () => {
    let adminMqttClient: MqttClient;
    let adminUserProcessEvents: ProcessEvent[] = [];

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect admin MQTT client for embeddingModels', async () => {
      adminMqttClient = await connectMqtt(auth.admin.jwt);
      adminMqttClient.subscribe(`users/${auth.admin.userId}/processEvents`);
      adminMqttClient.on('message', (_topic, msg) => {
        adminUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    // ─── READ: no models exist yet ──────────────────────────────

    it('gets no embeddingModels as Admin', async () => {
      const { status, body } = await api('GET', '/embedding-models', auth.admin.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── ADMIN creates embeddingModel ───────────────────────────

    it('can add a EmbeddingModel all-minilm:22m to Ollama as Admin', async () => {
      const res1 = await api('GET', '/ai-providers?name=Ollama Embedding', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const ollama = res1.body.data[0];

      const { status, body } = await api('POST', '/embedding-models', auth.admin.jwt, {
        providerModelName: 'all-minilm:22m',
        info: 'All-MiniLM 22M - tiny and fast embedding model (46MB)',
        dollarPerInputToken: 0,
        dollarPerOutputToken: 0,
        recommended: false,
        aiProviderId: ollama.id,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('providerModelName', 'all-minilm:22m');
      expect(body).toHaveProperty('info', 'All-MiniLM 22M - tiny and fast embedding model (46MB)');
      expect(body).toHaveProperty('recommended', false);
      expect(body).toHaveProperty('aiProviderId', ollama.id);
      embeddingModelId = body.id;
    });

    it('adminUserProcessEvents contains 2 EmbeddingModel Events', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(adminUserProcessEvents);
      const embeddingModelEvents = events.EmbeddingModel || [];
      expect(embeddingModelEvents.length).toBe(2);
      expect(embeddingModelEvents.some((e: ProcessEvent) => e.jobStatus === 'active')).toBe(true);
      expect(embeddingModelEvents.some((e: ProcessEvent) => e.jobStatus === 'completed')).toBe(true);
      adminUserProcessEvents = [];
    });

    // ─── READ: models exist ─────────────────────────────────────

    it('gets all embeddingModels without JWT', async () => {
      const { status, body } = await get('/embedding-models');
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('gets all embeddingModels as Alice', async () => {
      const { status, body } = await api('GET', '/embedding-models', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('gets embeddingModel all-minilm:22m without JWT', async () => {
      const res1 = await api('GET', '/embedding-models?providerModelName=all-minilm:22m', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const allMinilmOllama = res1.body.data[0];

      const { status, body } = await get(`/embedding-models/${allMinilmOllama.id}`);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', allMinilmOllama.id);
      expect(body).toHaveProperty('providerModelName', allMinilmOllama.providerModelName);
    });

    it('gets embeddingModel all-minilm:22m as Alice', async () => {
      const res1 = await api('GET', '/embedding-models?providerModelName=all-minilm:22m', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const allMinilmOllama = res1.body.data[0];

      const { status, body } = await api('GET', `/embedding-models/${allMinilmOllama.id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', allMinilmOllama.id);
      expect(body).toHaveProperty('providerModelName', allMinilmOllama.providerModelName);
    });

    it('gets all embeddingModels from ai-provider ollama as Alice', async () => {
      const res1 = await api('GET', '/ai-providers?name=Ollama Embedding', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const ollama = res1.body.data[0];

      const { status, body } = await api('GET', `/ai-providers/${ollama.id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.embeddingModels)).toBe(true);
      expect(body.embeddingModels.length).toBe(1);
    });

    // ─── UPDATE ─────────────────────────────────────────────────

    it('alice can not update the EmbeddingModel', async () => {
      const res1 = await api('GET', '/embedding-models?providerModelName=all-minilm:22m', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const allMinilmOllama = res1.body.data[0];

      const { status } = await api('PATCH', `/embedding-models/${allMinilmOllama.id}`, auth.alice.jwt, {
        recommended: true,
      });
      expect(status).toBe(403);
    });

    it('updates EmbeddingModel all-minilm:22m to recommended as Admin', async () => {
      const res1 = await api('GET', '/embedding-models?providerModelName=all-minilm:22m', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const allMinilmOllama = res1.body.data[0];

      const { status, body } = await api('PATCH', `/embedding-models/${allMinilmOllama.id}`, auth.admin.jwt, {
        recommended: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('recommended', true);
      expect(body).toHaveProperty('error', null);
      expect(body).toHaveProperty('providerModelName', 'all-minilm:22m');
    });

    it('gets embeddingModel all-minilm:22m as Alice as recommended', async () => {
      const res1 = await api('GET', '/embedding-models?providerModelName=all-minilm:22m', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const allMinilmOllama = res1.body.data[0];

      const { status, body } = await api('GET', `/embedding-models/${allMinilmOllama.id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', allMinilmOllama.id);
      expect(body).toHaveProperty('recommended', true);
    });

    // ─── DELETE ─────────────────────────────────────────────────

    it('alice can not delete the EmbeddingModel', async () => {
      const res1 = await api('GET', '/embedding-models?providerModelName=all-minilm:22m', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const allMinilmOllama = res1.body.data[0];

      const { status } = await api('DELETE', `/embedding-models/${allMinilmOllama.id}`, auth.alice.jwt);
      expect(status).toBe(403);
    });

    it('gets all embeddingModels after delete', async () => {
      const { status, body } = await api('GET', '/embedding-models', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    // ─── MQTT cleanup ─────────────────────────────────────────

    it('consume remaining events from embedding model operations', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      const events = groupByResourceName(adminUserProcessEvents);
      expect(events.EmbeddingModel?.length).toBeGreaterThanOrEqual(2);
      adminUserProcessEvents = [];
    });

    it('no unprocessed events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      if (adminUserProcessEvents.length > 0) console.log('Unprocessed admin user events:', adminUserProcessEvents.length, adminUserProcessEvents);
      expect(adminUserProcessEvents.length).toBe(0);
    });

    it('close admin MQTT client for embeddingModels', () => {
      adminMqttClient?.end();
    });
  });
}
