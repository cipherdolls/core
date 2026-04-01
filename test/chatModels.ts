
import { auth, api, get, connectMqtt, subscribeTopic, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient, MQTT_URL } from './helpers';

// Module-level ID for cross-test imports
export let chatModelId: string;

export function describeChatModels() {
  describe('chatModels', () => {
    let adminMqttClient: MqttClient;
    let adminUserProcessEvents: ProcessEvent[] = [];

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect admin MQTT client for chatModels', async () => {
      adminMqttClient = await connectMqtt(auth.admin.jwt);
      adminMqttClient.subscribe(`users/${auth.admin.userId}/processEvents`);
      adminMqttClient.on('message', (_topic, msg) => {
        adminUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    // ─── READ: no models exist yet ──────────────────────────────

    it('gets no chatModels as Admin', async () => {
      const { status, body } = await api('GET', '/chat-models', auth.admin.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── ADMIN creates chatModel ────────────────────────────────

    it('can add a ChatModel llama3.2:1b to OllamaChat as Admin', async () => {
      const res1 = await api('GET', '/ai-providers?name=Ollama Chat', auth.admin.jwt);
      expect(res1.status).toBe(200);
      const ollamaChat = res1.body.data[0];

      const { status, body } = await api('POST', '/chat-models', auth.admin.jwt, {
        providerModelName: 'llama3.2:1b',
        info: 'Meta Llama 3.2 1B - lightweight chat model for edge deployment (1.3GB)',
        dollarPerInputToken: 0,
        dollarPerOutputToken: 0,
        contextWindow: 128000,
        recommended: false,
        censored: true,
        aiProviderId: ollamaChat.id,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('providerModelName', 'llama3.2:1b');
      expect(body).toHaveProperty('aiProviderId', ollamaChat.id);
      chatModelId = body.id;
    });

    it('adminUserProcessEvents contains 2 ChatModel Events', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(adminUserProcessEvents);
      const chatModelEvents = events.ChatModel || [];
      expect(chatModelEvents.length).toBe(2);
      expect(chatModelEvents.some((e: ProcessEvent) => e.jobStatus === 'active')).toBe(true);
      expect(chatModelEvents.some((e: ProcessEvent) => e.jobStatus === 'completed')).toBe(true);
      adminUserProcessEvents = [];
    });

    // ─── READ: models exist ─────────────────────────────────────

    it('gets all chatModels without JWT', async () => {
      const { status, body } = await get('/chat-models');
      expect(status).toBe(200);
      expect(body).toHaveProperty('meta');
      expect(body.meta.total).toBe(1);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(1);
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('gets all chatModels as Alice', async () => {
      const { status, body } = await api('GET', '/chat-models', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('meta');
      expect(body.meta.total).toBe(1);
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('gets chatModel llama3.2:1b without JWT', async () => {
      // by Name
      const res1 = await get('/chat-models?name=llama3.2:1b');
      expect(res1.status).toBe(200);
      const llama32Ollama = res1.body.data[0];

      // by ID
      const { status, body } = await get(`/chat-models/${llama32Ollama.id}`);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', llama32Ollama.id);
      expect(body).toHaveProperty('providerModelName', llama32Ollama.providerModelName);
    });

    it('gets chatModel llama3.2:1b as Alice', async () => {
      // by Name
      const res1 = await api('GET', '/chat-models?name=llama3.2:1b', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const llama32Ollama = res1.body.data[0];

      // by ID
      const { status, body } = await api('GET', `/chat-models/${llama32Ollama.id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', llama32Ollama.id);
      expect(body).toHaveProperty('providerModelName', llama32Ollama.providerModelName);
    });

    // ─── UPDATE ─────────────────────────────────────────────────

    it('alice can not update the ChatModel', async () => {
      const res1 = await api('GET', '/chat-models?name=llama3.2:1b', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const llama32Ollama = res1.body.data[0];

      const { status } = await api('PATCH', `/chat-models/${llama32Ollama.id}`, auth.alice.jwt, {
        recommended: true,
      });
      expect(status).toBe(403);
    });

    it('updates ChatModel llama3.2:1b to recommended as Admin', async () => {
      const res1 = await api('GET', '/chat-models?name=llama3.2:1b', auth.admin.jwt);
      expect(res1.status).toBe(200);
      const llama32Ollama = res1.body.data[0];

      const { status, body } = await api('PATCH', `/chat-models/${llama32Ollama.id}`, auth.admin.jwt, {
        recommended: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('recommended', true);
      expect(body).toHaveProperty('error', null);
      expect(body).toHaveProperty('providerModelName', 'llama3.2:1b');
    });

    // ─── DELETE ─────────────────────────────────────────────────

    it('alice can not delete the ChatModel', async () => {
      const res1 = await api('GET', '/chat-models?name=llama3.2:1b', auth.admin.jwt);
      expect(res1.status).toBe(200);
      const llama32Ollama = res1.body.data[0];

      const { status } = await api('DELETE', `/chat-models/${llama32Ollama.id}`, auth.alice.jwt);
      expect(status).toBe(403);
    });

    // ─── FREE flag ──────────────────────────────────────────────

    it('chatModel llama3.2:1b has free=true since costs are zero', async () => {
      const res1 = await api('GET', '/chat-models?name=llama3.2:1b', auth.admin.jwt);
      expect(res1.status).toBe(200);
      const chatModel = res1.body.data[0];
      expect(chatModel).toHaveProperty('free', true);
      expect(Number(chatModel.dollarPerInputToken)).toBe(0);
      expect(Number(chatModel.dollarPerOutputToken)).toBe(0);
    });

    it('updates chatModel costs and free becomes false', async () => {
      const res1 = await api('GET', '/chat-models?name=llama3.2:1b', auth.admin.jwt);
      expect(res1.status).toBe(200);
      const chatModel = res1.body.data[0];

      const patchRes = await api('PATCH', `/chat-models/${chatModel.id}`, auth.admin.jwt, {
        dollarPerInputToken: 0.001,
        dollarPerOutputToken: 0.002,
      });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body).toHaveProperty('free', false);

      const res2 = await api('GET', `/chat-models/${chatModel.id}`, auth.admin.jwt);
      expect(res2.status).toBe(200);
      expect(res2.body).toHaveProperty('free', false);
      expect(Number(res2.body.dollarPerInputToken)).toBe(0.001);
    });

    it('updates chatModel costs back to zero and free becomes true', async () => {
      const res1 = await api('GET', '/chat-models?name=llama3.2:1b', auth.admin.jwt);
      expect(res1.status).toBe(200);
      const chatModel = res1.body.data[0];

      const patchRes = await api('PATCH', `/chat-models/${chatModel.id}`, auth.admin.jwt, {
        dollarPerInputToken: 0,
        dollarPerOutputToken: 0,
      });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body).toHaveProperty('free', true);

      const res2 = await api('GET', `/chat-models/${chatModel.id}`, auth.admin.jwt);
      expect(res2.status).toBe(200);
      expect(res2.body).toHaveProperty('free', true);
      expect(Number(res2.body.dollarPerInputToken)).toBe(0);
      expect(Number(res2.body.dollarPerOutputToken)).toBe(0);
    });

    it('gets all chatModels after delete', async () => {
      const { status, body } = await api('GET', '/chat-models', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('meta');
      expect(body.meta.total).toBe(1);
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('consume remaining events from chat model operations', async () => {
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

    it('close admin MQTT client for chatModels', () => {
      adminMqttClient?.end();
    });
  });
}
