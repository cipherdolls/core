
import { auth, api, get, connectMqtt, waitForEvents, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient } from './helpers';

// Module-level ID for cross-test imports
export let reasoningModelId: string;

export function describeReasoningModels() {
  describe('reasoningModels', () => {
    let adminMqttClient: MqttClient;
    let adminUserProcessEvents: ProcessEvent[] = [];

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect admin MQTT client for reasoningModels', async () => {
      adminMqttClient = await connectMqtt(auth.admin.jwt);
      adminMqttClient.subscribe(`users/${auth.admin.userId}/processEvents`);
      adminMqttClient.on('message', (_topic, msg) => {
        adminUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    // ─── READ: no models exist yet ──────────────────────────────

    it('gets no reasoningModels as Admin', async () => {
      const { status, body } = await api('GET', '/reasoning-models', auth.admin.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── ADMIN creates reasoningModel ───────────────────────────

    it('can add a ReasoningModel phi4-mini-reasoning to Ollama as Admin', async () => {
      const res1 = await api('GET', '/ai-providers?name=Ollama Reasoning', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const ollama = res1.body.data[0];

      const { status, body } = await api('POST', '/reasoning-models', auth.admin.jwt, {
        providerModelName: 'phi4-mini-reasoning',
        info: 'Microsoft Phi-4 Mini Reasoning - compact reasoning model with chain-of-thought (2.8GB)',
        dollarPerInputToken: 0,
        dollarPerOutputToken: 0,
        contextWindow: 128000,
        recommended: false,
        censored: false,
        aiProviderId: ollama.id,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('providerModelName', 'phi4-mini-reasoning');
      expect(body).toHaveProperty('aiProviderId', ollama.id);
      reasoningModelId = body.id;
    });

    it('adminUserProcessEvents contains 2 ReasoningModel Events', async () => {
      await waitForEvents(adminUserProcessEvents, 2, 30000);
      const events = groupByResourceName(adminUserProcessEvents);
      const reasoningModelEvents = events.ReasoningModel || [];
      expect(reasoningModelEvents.length).toBe(2);
      expect(reasoningModelEvents.some((e: ProcessEvent) => e.jobStatus === 'active')).toBe(true);
      expect(reasoningModelEvents.some((e: ProcessEvent) => e.jobStatus === 'completed')).toBe(true);
      adminUserProcessEvents = [];
    });

    // ─── READ: models exist ─────────────────────────────────────

    it('gets all reasoningModels without JWT', async () => {
      const { status, body } = await get('/reasoning-models');
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('gets all reasoningModels as Alice', async () => {
      const { status, body } = await api('GET', '/reasoning-models', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('gets reasoningModel phi4-mini-reasoning without JWT', async () => {
      const res1 = await get('/reasoning-models?providerModelName=phi4-mini-reasoning');
      expect(res1.status).toBe(200);
      const phi4Ollama = res1.body.data[0];

      const { status, body } = await get(`/reasoning-models/${phi4Ollama.id}`);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', phi4Ollama.id);
      expect(body).toHaveProperty('providerModelName', 'phi4-mini-reasoning');
    });

    it('gets reasoningModel phi4-mini-reasoning as Alice', async () => {
      const res1 = await get('/reasoning-models?providerModelName=phi4-mini-reasoning');
      expect(res1.status).toBe(200);
      const phi4Ollama = res1.body.data[0];

      const { status, body } = await api('GET', `/reasoning-models/${phi4Ollama.id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', phi4Ollama.id);
      expect(body).toHaveProperty('providerModelName', phi4Ollama.providerModelName);
    });

    it('gets all reasoningModels from ai-provider ollama as Alice', async () => {
      const res1 = await api('GET', '/ai-providers?name=Ollama Reasoning', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const ollama = res1.body.data[0];

      const { status, body } = await api('GET', `/ai-providers/${ollama.id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.reasoningModels)).toBe(true);
      expect(body.reasoningModels.length).toBe(1);
    });

    // ─── UPDATE ─────────────────────────────────────────────────

    it('alice can not update the ReasoningModel', async () => {
      const res1 = await get('/reasoning-models?providerModelName=phi4-mini-reasoning');
      expect(res1.status).toBe(200);
      const phi4Ollama = res1.body.data[0];

      const { status } = await api('PATCH', `/reasoning-models/${phi4Ollama.id}`, auth.alice.jwt, {
        recommended: true,
      });
      expect(status).toBe(403);
    });

    it('updates ReasoningModel phi4-mini-reasoning to recommended as Admin', async () => {
      const res1 = await get('/reasoning-models?providerModelName=phi4-mini-reasoning');
      expect(res1.status).toBe(200);
      const phi4Ollama = res1.body.data[0];

      const { status, body } = await api('PATCH', `/reasoning-models/${phi4Ollama.id}`, auth.admin.jwt, {
        recommended: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('recommended', true);
      expect(body).toHaveProperty('error', null);
      expect(body).toHaveProperty('providerModelName', 'phi4-mini-reasoning');
    });

    it('gets reasoningModel phi4-mini-reasoning as Alice as recommended', async () => {
      const res1 = await get('/reasoning-models?providerModelName=phi4-mini-reasoning');
      expect(res1.status).toBe(200);
      const phi4Ollama = res1.body.data[0];

      const { status, body } = await api('GET', `/reasoning-models/${phi4Ollama.id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', phi4Ollama.id);
      expect(body).toHaveProperty('recommended', true);
    });

    // ─── DELETE ─────────────────────────────────────────────────

    it('alice can not delete the ReasoningModel', async () => {
      const res1 = await get('/reasoning-models?providerModelName=phi4-mini-reasoning');
      expect(res1.status).toBe(200);
      const phi4Ollama = res1.body.data[0];

      const { status } = await api('DELETE', `/reasoning-models/${phi4Ollama.id}`, auth.alice.jwt);
      expect(status).toBe(403);
    });

    it('gets all reasoningModels after delete', async () => {
      const { status, body } = await api('GET', '/reasoning-models', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    // ─── MQTT cleanup ─────────────────────────────────────────

    it('consume remaining events from reasoning model operations', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      adminUserProcessEvents = [];
    });

    it('no unprocessed events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      if (adminUserProcessEvents.length > 0) console.log('Unprocessed admin user events:', adminUserProcessEvents.length, adminUserProcessEvents);
      expect(adminUserProcessEvents.length).toBe(0);
    });

    it('close admin MQTT client for reasoningModels', () => {
      adminMqttClient?.end();
    });
  });
}
