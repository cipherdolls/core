
import { auth, api, connectMqtt, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient } from './helpers';
import { hanaChatId } from './chats';

export function describeChatCompletionJobs() {
  describe('chatCompletionJobs Controller (e2e)', () => {
    let aliceMqttClient: MqttClient;
    let aliceChatProcessEvents: ProcessEvent[] = [];

    let originalScenarioId: string;
    let originalChatModelId: string;
    let originalProviderModelName: string;
    let notWorkingScenarioId: string;

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect alice MQTT client for chatCompletionJobs', async () => {
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
      aliceMqttClient.subscribe(`chats/${hanaChatId}/processEvents`);
      aliceMqttClient.on('message', (_topic, msg) => {
        aliceChatProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    // ─── Save original state ────────────────────────────────────

    it('save hanaChat original scenario', async () => {
      const { body } = await api('GET', `/chats/${hanaChatId}`, auth.alice.jwt);
      originalScenarioId = body.scenarioId;
    });

    // ─── Create a scenario with a broken model ──────────────────

    it('admin gets the chat model and saves its providerModelName', async () => {
      const { body: chatModels } = await api('GET', '/chat-models', auth.admin.jwt);
      const chatModel = chatModels.data[0];
      originalChatModelId = chatModel.id;
      originalProviderModelName = chatModel.providerModelName;
    });

    it('admin creates a notWorking scenario', async () => {
      const { status, body } = await api('POST', '/scenarios', auth.alice.jwt, {
        name: 'not working ccj',
        systemMessage: 'you are not working',
        chatModelId: originalChatModelId,
      });
      expect(status).toBe(200);
      notWorkingScenarioId = body.id;
    });

    it('admin updates chat model to fake/unknown', async () => {
      const { status } = await api('PATCH', `/chat-models/${originalChatModelId}`, auth.admin.jwt, {
        providerModelName: 'fake/unknown',
      });
      expect(status).toBe(200);
    });

    // ─── Switch chat to broken scenario and post a message ──────

    it('alice updates hanaChat to notWorking scenario', async () => {
      const { status } = await api('PATCH', `/chats/${hanaChatId}`, auth.alice.jwt, {
        scenarioId: notWorkingScenarioId,
        tts: false,
      });
      expect(status).toBe(200);
    });

    it('queues are empty before posting', async () => {
      await waitForQueuesEmpty(60000);
      expect(aliceChatProcessEvents.length).toBe(0);
    });

    it('alice posts a message to trigger broken chat completion', async () => {
      const { status, body } = await api('POST', '/messages', auth.alice.jwt, {
        chatId: hanaChatId,
        content: 'hello',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
    });

    it('aliceChatProcessEvents contains events after broken message', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceChatProcessEvents);
      const chatCompletionJobs = processEvents.ChatCompletionJob || [];
      expect(chatCompletionJobs.length).toBeGreaterThanOrEqual(1);
      aliceChatProcessEvents = [];
    });

    // ─── Get chat-completion-jobs ───────────────────────────────

    let chatCompletionJobId: string;

    it('alice gets the chat-completion-jobs for hanaChat', async () => {
      // Wait for processing to finish
      await new Promise((r) => setTimeout(r, 3000));
      const { status, body } = await api('GET', `/chat-completion-jobs?chatId=${hanaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      chatCompletionJobId = body.data[0].id;
    });

    it('alice gets chat-completion-job by id', async () => {
      const { status, body } = await api('GET', `/chat-completion-jobs/${chatCompletionJobId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', chatCompletionJobId);
      expect(body).toHaveProperty('chatModel');
    });

    it('chat-completion-job has error from fake model', async () => {
      const { body } = await api('GET', `/chat-completion-jobs/${chatCompletionJobId}`, auth.alice.jwt);
      expect(body.error).toBeTruthy();
    });

    // ─── Restore ────────────────────────────────────────────────

    it('admin restores chat model providerModelName', async () => {
      const { status } = await api('PATCH', `/chat-models/${originalChatModelId}`, auth.admin.jwt, {
        providerModelName: originalProviderModelName,
      });
      expect(status).toBe(200);
    });

    it('alice restores hanaChat to original scenario', async () => {
      const { status } = await api('PATCH', `/chats/${hanaChatId}`, auth.alice.jwt, {
        scenarioId: originalScenarioId,
      });
      expect(status).toBe(200);
    });

    it('consume remaining events', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      aliceChatProcessEvents = [];
    });

    it('no unprocessed events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      if (aliceChatProcessEvents.length > 0) console.log('Unprocessed alice chat events:', aliceChatProcessEvents.length, aliceChatProcessEvents);
      expect(aliceChatProcessEvents.length).toBe(0);
    });

    it('close alice MQTT client for chatCompletionJobs', () => {
      aliceMqttClient?.end();
    });
  });
}
