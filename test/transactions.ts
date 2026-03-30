
import { auth, api, get, connectMqtt, waitForEvents, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient } from './helpers';
import { smallTalkScenarioId, bobDeepTalkScenarioId } from './scenarios';
import { localWhisperId } from './sttProviders';
import { kokoroProviderId } from './ttsProviders';
import { chatModelId } from './chatModels';
import { embeddingModelId } from './embeddingModels';
import { ollamaChatProviderId } from './aiProviders';

export function describeTransactions() {
  describe('Transactions', () => {
    // User-scoped event names (published to users/{userId}/processEvents only)
    const userScopedResources = new Set(['Transaction', 'User']);

    let aliceMqttClient: MqttClient;
    let aliceUserProcessEvents: ProcessEvent[] = [];
    let aliceChatProcessEvents: ProcessEvent[] = [];

    let bobMqttClient: MqttClient;
    let bobUserProcessEvents: ProcessEvent[] = [];
    let bobChatProcessEvents: ProcessEvent[] = [];

    let guestMqttClient: MqttClient;
    let guestUserProcessEvents: ProcessEvent[] = [];
    let guestChatProcessEvents: ProcessEvent[] = [];

    // Resolved seed data
    let hanaId: string;
    let deepTalkScenarioIdLocal: string;
    let smallTalkScenarioIdLocal: string;

    // Chat + message IDs created during this test
    let aliceHanaSmallTalkChatId: string;
    let aliceAssistantMessageId: string;
    let aliceUserMessageId: string;

    let bobHanaDeepTalkChatId: string;
    let bobAssistantMessageId: string;

    let guestHanaDeepTalkChatId: string;
    let guestAssistantMessageId: string;

    // ─── Helper: poll until expected message count ────────────────

    async function waitForMessageCount(chatId: string, jwt: string, expected: number, timeout = 30000): Promise<any[]> {
      const interval = 1000;
      let elapsed = 0;
      while (elapsed < timeout) {
        const { body } = await api('GET', `/messages?chatId=${chatId}&order=asc`, jwt);
        if (body.data && body.data.length >= expected) return body.data;
        await new Promise((r) => setTimeout(r, interval));
        elapsed += interval;
      }
      throw new Error(`Timed out waiting for ${expected} messages in chat ${chatId}`);
    }

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect alice MQTT client', async () => {
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
      aliceMqttClient.subscribe(`users/${auth.alice.userId}/processEvents`);
      aliceMqttClient.on('message', (_topic, msg) => {
        const event = JSON.parse(msg.toString()) as ProcessEvent;
        if (userScopedResources.has(event.resourceName)) {
          aliceUserProcessEvents.push(event);
        } else {
          aliceChatProcessEvents.push(event);
        }
      });
    });

    it('connect bob MQTT client', async () => {
      bobMqttClient = await connectMqtt(auth.bob.jwt);
      bobMqttClient.subscribe(`users/${auth.bob.userId}/processEvents`);
      bobMqttClient.on('message', (_topic, msg) => {
        const event = JSON.parse(msg.toString()) as ProcessEvent;
        if (userScopedResources.has(event.resourceName)) {
          bobUserProcessEvents.push(event);
        } else {
          bobChatProcessEvents.push(event);
        }
      });
    });

    it('connect guest MQTT client', async () => {
      guestMqttClient = await connectMqtt(auth.guest.jwt);
      guestMqttClient.subscribe(`users/${auth.guest.userId}/processEvents`);
      guestMqttClient.on('message', (_topic, msg) => {
        const event = JSON.parse(msg.toString()) as ProcessEvent;
        if (userScopedResources.has(event.resourceName)) {
          guestUserProcessEvents.push(event);
        } else {
          guestChatProcessEvents.push(event);
        }
      });
    });

    it('drain late events from previous modules', async () => {
      await new Promise((r) => setTimeout(r, 2000));
      aliceUserProcessEvents = [];
      aliceChatProcessEvents = [];
      bobUserProcessEvents = [];
      bobChatProcessEvents = [];
      guestUserProcessEvents = [];
      guestChatProcessEvents = [];
    });

    // ─── Resolve seed data ──────────────────────────────────────

    it('resolve hana avatar', async () => {
      const { body: avatars } = await api('GET', '/avatars', auth.alice.jwt);
      const hana = avatars.data.find((a: any) => a.name === 'Hana');
      expect(hana).toBeTruthy();
      hanaId = hana.id;
    });

    it('resolve scenario IDs', async () => {
      smallTalkScenarioIdLocal = smallTalkScenarioId;
      expect(smallTalkScenarioIdLocal).toBeTruthy();

      const { body: nsfwScenarios } = await api('GET', '/scenarios?published=true&nsfw=true', auth.bob.jwt);
      const deepTalk = nsfwScenarios.data[0];
      expect(deepTalk).toBeTruthy();
      deepTalkScenarioIdLocal = deepTalk.id;
    });

    // ─── Admin updates providers/models to have costs ───────────

    it('admin updates STT provider to cost money', async () => {
      const { status, body } = await api('PATCH', `/stt-providers/${localWhisperId}`, auth.admin.jwt, {
        dollarPerSecond: 0.0001,
      });
      expect(status).toBe(200);
      expect(Number(body.dollarPerSecond)).toBeCloseTo(0.0001);
    });

    it('admin updates TTS provider to cost money', async () => {
      const { status, body } = await api('PATCH', `/tts-providers/${kokoroProviderId}`, auth.admin.jwt, {
        dollarPerCharacter: 0.0002,
      });
      expect(status).toBe(200);
      expect(Number(body.dollarPerCharacter)).toBeCloseTo(0.0002);
    });

    it('admin updates chat model to cost money', async () => {
      const { status, body } = await api('PATCH', `/chat-models/${chatModelId}`, auth.admin.jwt, {
        dollarPerOutputToken: 0.0003,
        dollarPerInputToken: 0.0004,
      });
      expect(status).toBe(200);
      expect(Number(body.dollarPerOutputToken)).toBeCloseTo(0.0003);
      expect(Number(body.dollarPerInputToken)).toBeCloseTo(0.0004);
    });

    it('admin updates embedding model to cost money', async () => {
      const { status, body } = await api('PATCH', `/embedding-models/${embeddingModelId}`, auth.admin.jwt, {
        dollarPerOutputToken: 0.0003,
        dollarPerInputToken: 0.0004,
      });
      expect(status).toBe(200);
      expect(Number(body.dollarPerOutputToken)).toBeCloseTo(0.0003);
      expect(Number(body.dollarPerInputToken)).toBeCloseTo(0.0004);
    });

    it('admin fixes Ollama Chat aiProvider basePath to reachable URL', async () => {
      const ollamaChatUrl = process.env.OLLAMA_CHAT_URL;
      expect(ollamaChatUrl).toBeTruthy();
      const { status, body } = await api('PATCH', `/ai-providers/${ollamaChatProviderId}`, auth.admin.jwt, {
        basePath: `${ollamaChatUrl}/v1`,
      });
      expect(status).toBe(200);
      expect(body.basePath).toBe(`${ollamaChatUrl}/v1`);
    });

    // ─── ALICE: balance check ───────────────────────────────────

    it('alice has 100 tokenBalance and 3.25 allowance', async () => {
      const { status, body } = await api('GET', '/users/me', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(100);
      expect(body.tokenAllowance).toBe(3.25);
      expect(body.tokenSpendable).toBe(3.25);
      expect(body.action).toBe('Nothing');
    });

    it('aliceUserProcessEvents contains 0 Events', async () => {
      expect(aliceUserProcessEvents.length).toBe(0);
      aliceUserProcessEvents = [];
    });

    it('alice gets 0 chats', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── ALICE: create hana SmallTalk chat ──────────────────────

    it('alice creates a hana SmallTalk chat', async () => {
      const { status, body } = await api('POST', '/chats', auth.alice.jwt, {
        avatarId: hanaId,
        scenarioId: smallTalkScenarioIdLocal,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', smallTalkScenarioIdLocal);
      aliceHanaSmallTalkChatId = body.id;
    });

    it('aliceChatProcessEvents after chat creation', async () => {
      await waitForEvents<ProcessEvent>(aliceChatProcessEvents, 16, 60000);

      const processEvents = groupByResourceName(aliceChatProcessEvents);
      const chats = processEvents.Chat || [];
      const messages = processEvents.Message || [];
      const ttsJobs = processEvents.TtsJob || [];
      const embeddingJobs = processEvents.EmbeddingJob || [];

      expect(chats.length).toBe(4);
      expect(messages.length).toBe(4);
      expect(ttsJobs.length).toBe(4);
      expect(embeddingJobs.length).toBe(4);

      aliceChatProcessEvents = [];
    });

    it('aliceUserProcessEvents after chat creation (greeting tts transaction)', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 8, 60000);

      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const transactions = processEvents.Transaction || [];
      const users = processEvents.User || [];

      expect(transactions.length).toBe(4);
      expect(users.length).toBe(4);

      aliceUserProcessEvents = [];
    });

    it('alice has slightly reduced token balance after greeting (tts transaction only)', async () => {
      const { status, body } = await api('GET', '/users/me', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBeLessThan(100);
      expect(body.tokenAllowance).toBeLessThan(3.25);
      expect(body.tokenSpendable).toBeLessThan(3.25);
      expect(body.action).toBe('Nothing');
    });

    // ─── ALICE: greeting message ────────────────────────────────

    it('alice gets 1 greeting message from hana SmallTalk chat', async () => {
      const { status, body } = await api('GET', `/messages?chatId=${aliceHanaSmallTalkChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
      const message = body.data[0];
      expect(message).toHaveProperty('id');
      expect(message.role).toBe('ASSISTANT');
    });

    // ─── ALICE: post text message ───────────────────────────────

    it('alice posts a text message to the hana SmallTalk chat', async () => {
      const { status, body } = await api('POST', '/messages', auth.alice.jwt, {
        chatId: aliceHanaSmallTalkChatId,
        content: 'I have to go to the supermarket and buy ice cream',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      aliceUserMessageId = body.id;
    });

    it('aliceUserProcessEvents after user message', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 16, 60000);

      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const transactions = processEvents.Transaction || [];
      const users = processEvents.User || [];

      expect(transactions.length).toBe(8);
      expect(users.length).toBe(8);

      aliceUserProcessEvents = [];
    });

    it('aliceChatProcessEvents after user message', async () => {
      await waitForEvents<ProcessEvent>(aliceChatProcessEvents, 22, 60000);

      const processEvents = groupByResourceName(aliceChatProcessEvents);
      const messages = processEvents.Message || [];
      const chatCompletionJobs = processEvents.ChatCompletionJob || [];
      const embeddingJobs = processEvents.EmbeddingJob || [];
      const ttsJobs = processEvents.TtsJob || [];

      expect(messages.length).toBe(6);
      expect(chatCompletionJobs.length).toBe(4);
      expect(embeddingJobs.length).toBe(8);
      expect(ttsJobs.length).toBe(4);

      aliceChatProcessEvents = [];
    });

    it('alice gets 3 messages from the hana SmallTalk chat', async () => {
      const messages = await waitForMessageCount(aliceHanaSmallTalkChatId, auth.alice.jwt, 3);
      expect(messages.length).toBe(3);

      const assistantMessages = messages.filter((m: any) => m.role === 'ASSISTANT');
      const userMessages = messages.filter((m: any) => m.role === 'USER');
      expect(assistantMessages.length).toBe(2);
      expect(userMessages.length).toBe(1);

      aliceAssistantMessageId = assistantMessages[assistantMessages.length - 1].id;
      aliceUserMessageId = userMessages[userMessages.length - 1].id;
    });

    it('chatCompletionJob is linked to assistant message, not user message', async () => {
      const { status: aStatus, body: assistantBody } = await api('GET', `/messages/${aliceAssistantMessageId}`, auth.alice.jwt);
      expect(aStatus).toBe(200);
      expect(assistantBody.chatCompletionJob).toBeDefined();

      const { status: uStatus, body: userBody } = await api('GET', `/messages/${aliceUserMessageId}`, auth.alice.jwt);
      expect(uStatus).toBe(200);
      expect(userBody.chatCompletionJob).toBeNull();
    });

    it('alice assistant message has a chatCompletion transaction with txHash', async () => {
      const { status, body } = await api('GET', `/transactions?messageId=${aliceAssistantMessageId}`, auth.alice.jwt);
      expect(status).toBe(200);
      const transactions: any[] = body.data;
      expect(Array.isArray(transactions)).toBe(true);
      const chatCompletionTx = transactions.find((tx: any) => tx.type === 'chatCompletion');
      expect(chatCompletionTx).toBeDefined();
      expect(chatCompletionTx.txHash).toBeTruthy();
      expect(chatCompletionTx.messageId).toBe(aliceAssistantMessageId);
      expect(chatCompletionTx.fromAddress).toBe(auth.alice.signerAddress);
    });

    it('alice assistant message has a tts transaction with txHash', async () => {
      const { status, body } = await api('GET', `/transactions?messageId=${aliceAssistantMessageId}`, auth.alice.jwt);
      expect(status).toBe(200);
      const transactions: any[] = body.data;
      expect(Array.isArray(transactions)).toBe(true);
      const ttsTx = transactions.find((tx: any) => tx.type === 'tts');
      expect(ttsTx).toBeDefined();
      expect(ttsTx.txHash).toBeTruthy();
      expect(ttsTx.messageId).toBe(aliceAssistantMessageId);
      expect(ttsTx.fromAddress).toBe(auth.alice.signerAddress);
    });

    it('alice has reduced token balance after user message', async () => {
      const { status, body } = await api('GET', '/users/me', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBeLessThan(100);
      expect(body.tokenAllowance).toBeLessThan(3.25);
      expect(body.tokenSpendable).toBeLessThan(3.25);
      expect(body.action).toBe('Nothing');
    });

    // ─── BOB: balance check + events ─────────────────────────────

    it('bobUserProcessEvents contains 0 Events', async () => {
      expect(bobUserProcessEvents.length).toBe(0);
    });

    it('bobChatProcessEvents contains 0 Events', async () => {
      expect(bobChatProcessEvents.length).toBe(0);
    });

    it('bob has 100 tokenBalance and 2.0 allowance (sponsored)', async () => {
      const { status, body } = await api('GET', '/users/me', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(100);
      expect(body.tokenAllowance).toBe(2);
      expect(body.tokenSpendable).toBe(2);
      expect(body.action).toBe('Nothing');
    });

    // ─── BOB: create hana DeepTalk chat (sponsored by alice) ────

    it('bob creates a hana DeepTalk chat (sponsored by alice)', async () => {
      const { status, body } = await api('POST', '/chats', auth.bob.jwt, {
        avatarId: hanaId,
        scenarioId: deepTalkScenarioIdLocal,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', deepTalkScenarioIdLocal);
      bobHanaDeepTalkChatId = body.id;
    });

    it('bobChatProcessEvents after chat creation', async () => {
      await waitForEvents<ProcessEvent>(bobChatProcessEvents, 12, 60000);

      const processEvents = groupByResourceName(bobChatProcessEvents);
      const chats = processEvents.Chat || [];
      const messages = processEvents.Message || [];
      const ttsJobs = processEvents.TtsJob || [];

      expect(chats.length).toBe(4);
      expect(messages.length).toBe(4);
      expect(ttsJobs.length).toBe(4);

      bobChatProcessEvents = [];
    });

    it('bobUserProcessEvents after chat creation (greeting tts transaction)', async () => {
      await waitForEvents<ProcessEvent>(bobUserProcessEvents, 8, 60000);

      const processEvents = groupByResourceName(bobUserProcessEvents);
      const transactions = processEvents.Transaction || [];
      const users = processEvents.User || [];

      expect(transactions.length).toBe(4);
      expect(users.length).toBe(4);

      bobUserProcessEvents = [];
    });

    it('bob has unchanged tokenBalance after greeting (sponsored by alice)', async () => {
      const { status, body } = await api('GET', '/users/me', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(100);
      expect(body.tokenAllowance).toBe(2.0);
      expect(body.tokenSpendable).toBe(2.0);
      expect(body.action).toBe('Nothing');
    });

    // ─── BOB: greeting + post message ───────────────────────────

    it('bob gets 1 greeting message from hana DeepTalk chat', async () => {
      const { status, body } = await api('GET', `/messages?chatId=${bobHanaDeepTalkChatId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('bob posts a text message to the hana DeepTalk chat', async () => {
      const { status, body } = await api('POST', '/messages', auth.bob.jwt, {
        chatId: bobHanaDeepTalkChatId,
        content: 'I have to go to the supermarket and buy ice cream',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
    });

    it('bobUserProcessEvents after user message', async () => {
      await waitForEvents<ProcessEvent>(bobUserProcessEvents, 16, 60000);

      const processEvents = groupByResourceName(bobUserProcessEvents);
      const transactions = processEvents.Transaction || [];
      const users = processEvents.User || [];

      expect(transactions.length).toBe(8);
      expect(users.length).toBe(8);

      bobUserProcessEvents = [];
    });

    it('bobChatProcessEvents after user message', async () => {
      await waitForEvents<ProcessEvent>(bobChatProcessEvents, 14, 60000);

      const processEvents = groupByResourceName(bobChatProcessEvents);
      const messages = processEvents.Message || [];
      const chatCompletionJobs = processEvents.ChatCompletionJob || [];
      const ttsJobs = processEvents.TtsJob || [];

      expect(messages.length).toBe(6);
      expect(chatCompletionJobs.length).toBe(4);
      expect(ttsJobs.length).toBe(4);

      bobChatProcessEvents = [];
    });

    it('bob gets 3 messages from the hana DeepTalk chat', async () => {
      const messages = await waitForMessageCount(bobHanaDeepTalkChatId, auth.bob.jwt, 3);
      expect(messages.length).toBe(3);

      const assistantMessages = messages.filter((m: any) => m.role === 'ASSISTANT');
      expect(assistantMessages.length).toBe(2);
      bobAssistantMessageId = assistantMessages[assistantMessages.length - 1].id;
    });

    it('bob assistant message has a chatCompletion transaction sponsored by alice', async () => {
      const { status, body } = await api('GET', `/transactions?messageId=${bobAssistantMessageId}`, auth.bob.jwt);
      expect(status).toBe(200);
      const transactions: any[] = body.data;
      expect(Array.isArray(transactions)).toBe(true);
      const chatCompletionTx = transactions.find((tx: any) => tx.type === 'chatCompletion');
      expect(chatCompletionTx).toBeDefined();
      expect(chatCompletionTx.txHash).toBeTruthy();
      expect(chatCompletionTx.messageId).toBe(bobAssistantMessageId);
      expect(chatCompletionTx.fromAddress).toBe(auth.alice.signerAddress); // sponsored by alice
    });

    it('bob assistant message has a tts transaction sponsored by alice', async () => {
      const { status, body } = await api('GET', `/transactions?messageId=${bobAssistantMessageId}`, auth.bob.jwt);
      expect(status).toBe(200);
      const transactions: any[] = body.data;
      expect(Array.isArray(transactions)).toBe(true);
      const ttsTx = transactions.find((tx: any) => tx.type === 'tts');
      expect(ttsTx).toBeDefined();
      expect(ttsTx.txHash).toBeTruthy();
      expect(ttsTx.messageId).toBe(bobAssistantMessageId);
      expect(ttsTx.fromAddress).toBe(auth.alice.signerAddress); // sponsored by alice
    });

    it('bob has unchanged tokenBalance after user message (sponsored by alice)', async () => {
      const { status, body } = await api('GET', '/users/me', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(100);
      expect(body.tokenAllowance).toBe(2.0);
      expect(body.tokenSpendable).toBe(2.0);
      expect(body.action).toBe('Nothing');
    });

    // ─── GUEST: token enforcement + sponsorship bypass ──────────

    it('guest has 0 tokenSpendable', async () => {
      const { status, body } = await api('GET', '/users/me', auth.guest.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(0);
      expect(body.tokenAllowance).toBe(0);
      expect(body.tokenSpendable).toBe(0);
    });

    let guestHanaSmallTalkChatId: string;

    it('guest CAN create a hana SmallTalk chat (free scenario + free avatar)', async () => {
      const { status, body } = await api('POST', '/chats', auth.guest.jwt, {
        avatarId: hanaId,
        scenarioId: smallTalkScenarioIdLocal,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      guestHanaSmallTalkChatId = body.id;
    });

    it('guest deletes the free SmallTalk chat', async () => {
      const { status } = await api('DELETE', `/chats/${guestHanaSmallTalkChatId}`, auth.guest.jwt);
      expect(status).toBe(200);
    });

    it('drain guestProcessEvents after free SmallTalk chat create+delete', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      guestUserProcessEvents = [];
      guestChatProcessEvents = [];
    });

    it('guest creates a hana DeepTalk chat (sponsored by alice)', async () => {
      const { status, body } = await api('POST', '/chats', auth.guest.jwt, {
        avatarId: hanaId,
        scenarioId: deepTalkScenarioIdLocal,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', deepTalkScenarioIdLocal);
      guestHanaDeepTalkChatId = body.id;
    });

    it('guestChatProcessEvents after chat creation', async () => {
      await waitForEvents<ProcessEvent>(guestChatProcessEvents, 10, 60000);

      const processEvents = groupByResourceName(guestChatProcessEvents);
      const chats = processEvents.Chat || [];
      const messages = processEvents.Message || [];
      const ttsJobs = processEvents.TtsJob || [];

      expect(chats.length).toBe(2);
      expect(messages.length).toBe(4);
      expect(ttsJobs.length).toBe(4);

      guestChatProcessEvents = [];
    });

    it('guestUserProcessEvents after chat creation (greeting tts transaction)', async () => {
      await waitForEvents<ProcessEvent>(guestUserProcessEvents, 8, 60000);

      const processEvents = groupByResourceName(guestUserProcessEvents);
      const transactions = processEvents.Transaction || [];
      const users = processEvents.User || [];

      expect(transactions.length).toBe(4);
      expect(users.length).toBe(4);

      guestUserProcessEvents = [];
    });

    it('guest gets 1 greeting message from hana DeepTalk chat', async () => {
      const { status, body } = await api('GET', `/messages?chatId=${guestHanaDeepTalkChatId}`, auth.guest.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('guest posts a text message to the hana DeepTalk chat', async () => {
      const { status, body } = await api('POST', '/messages', auth.guest.jwt, {
        chatId: guestHanaDeepTalkChatId,
        content: 'I have to go to the supermarket and buy ice cream',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
    });

    it('guestUserProcessEvents after user message', async () => {
      await waitForEvents<ProcessEvent>(guestUserProcessEvents, 16, 60000);

      const processEvents = groupByResourceName(guestUserProcessEvents);
      const transactions = processEvents.Transaction || [];
      const users = processEvents.User || [];

      expect(transactions.length).toBe(8);
      expect(users.length).toBe(8);

      guestUserProcessEvents = [];
    });

    it('guestChatProcessEvents after user message', async () => {
      await waitForEvents<ProcessEvent>(guestChatProcessEvents, 14, 60000);

      const processEvents = groupByResourceName(guestChatProcessEvents);
      const messages = processEvents.Message || [];
      const chatCompletionJobs = processEvents.ChatCompletionJob || [];
      const ttsJobs = processEvents.TtsJob || [];

      expect(messages.length).toBe(6);
      expect(chatCompletionJobs.length).toBe(4);
      expect(ttsJobs.length).toBe(4);

      guestChatProcessEvents = [];
    });

    it('guest gets 3 messages from the hana DeepTalk chat', async () => {
      const messages = await waitForMessageCount(guestHanaDeepTalkChatId, auth.guest.jwt, 3);
      expect(messages.length).toBe(3);

      const assistantMessages = messages.filter((m: any) => m.role === 'ASSISTANT');
      expect(assistantMessages.length).toBe(2);
      guestAssistantMessageId = assistantMessages[assistantMessages.length - 1].id;
    });

    it('guest assistant message has a chatCompletion transaction sponsored by alice', async () => {
      const { status, body } = await api('GET', `/transactions?messageId=${guestAssistantMessageId}`, auth.guest.jwt);
      expect(status).toBe(200);
      const transactions: any[] = body.data;
      expect(Array.isArray(transactions)).toBe(true);
      const chatCompletionTx = transactions.find((tx: any) => tx.type === 'chatCompletion');
      expect(chatCompletionTx).toBeDefined();
      expect(chatCompletionTx.txHash).toBeTruthy();
      expect(chatCompletionTx.messageId).toBe(guestAssistantMessageId);
      expect(chatCompletionTx.fromAddress).toBe(auth.alice.signerAddress); // sponsored by alice
    });

    it('guest assistant message has a tts transaction sponsored by alice', async () => {
      const { status, body } = await api('GET', `/transactions?messageId=${guestAssistantMessageId}`, auth.guest.jwt);
      expect(status).toBe(200);
      const transactions: any[] = body.data;
      expect(Array.isArray(transactions)).toBe(true);
      const ttsTx = transactions.find((tx: any) => tx.type === 'tts');
      expect(ttsTx).toBeDefined();
      expect(ttsTx.txHash).toBeTruthy();
      expect(ttsTx.messageId).toBe(guestAssistantMessageId);
      expect(ttsTx.fromAddress).toBe(auth.alice.signerAddress); // sponsored by alice
    });

    it('guest has 0 tokenSpendable after user message (sponsored by alice)', async () => {
      const { status, body } = await api('GET', '/users/me', auth.guest.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(0);
      expect(body.tokenAllowance).toBe(0);
      expect(body.tokenSpendable).toBe(0);
    });

    // ─── Cross-user transaction access ──────────────────────────

    it('bob cannot see transactions for alice assistant messages', async () => {
      const { status, body } = await api('GET', `/transactions?messageId=${aliceAssistantMessageId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    it('alice cannot see transactions for bob assistant messages', async () => {
      const { status, body } = await api('GET', `/transactions?messageId=${bobAssistantMessageId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    it('guest cannot see transactions for alice assistant messages', async () => {
      const { status, body } = await api('GET', `/transactions?messageId=${aliceAssistantMessageId}`, auth.guest.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── 401 unauthenticated tests ──────────────────────────────

    it('GET /transactions without auth returns 401', async () => {
      const { status } = await get('/transactions');
      expect(status).toBe(401);
    });

    it('GET /transactions/:id without auth returns 401', async () => {
      const { status } = await get('/transactions/00000000-0000-0000-0000-000000000000');
      expect(status).toBe(401);
    });

    // ─── Validation & 404 tests ─────────────────────────────────

    it('GET /transactions requires messageId (400)', async () => {
      const { status } = await api('GET', '/transactions', auth.alice.jwt);
      expect(status).toBe(400);
    });

    it('GET /transactions with non-existent messageId returns empty', async () => {
      const { status, body } = await api('GET', '/transactions?messageId=00000000-0000-0000-0000-000000000000', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    it('GET /transactions/:nonExistentId returns 404', async () => {
      const { status } = await api('GET', '/transactions/00000000-0000-0000-0000-000000000000', auth.alice.jwt);
      expect(status).toBe(404);
    });

    // ─── MQTT cleanup ───────────────────────────────────────────

    it('consume remaining events', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      aliceUserProcessEvents = [];
      aliceChatProcessEvents = [];
      bobUserProcessEvents = [];
      bobChatProcessEvents = [];
      guestUserProcessEvents = [];
      guestChatProcessEvents = [];
    });

    it('no unprocessed events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      if (aliceUserProcessEvents.length > 0) console.log('Unprocessed alice user events:', aliceUserProcessEvents.length, aliceUserProcessEvents);
      if (aliceChatProcessEvents.length > 0) console.log('Unprocessed alice chat events:', aliceChatProcessEvents.length, aliceChatProcessEvents);
      if (bobUserProcessEvents.length > 0) console.log('Unprocessed bob user events:', bobUserProcessEvents.length, bobUserProcessEvents);
      if (bobChatProcessEvents.length > 0) console.log('Unprocessed bob chat events:', bobChatProcessEvents.length, bobChatProcessEvents);
      if (guestUserProcessEvents.length > 0) console.log('Unprocessed guest user events:', guestUserProcessEvents.length, guestUserProcessEvents);
      if (guestChatProcessEvents.length > 0) console.log('Unprocessed guest chat events:', guestChatProcessEvents.length, guestChatProcessEvents);
      expect(aliceUserProcessEvents.length).toBe(0);
      expect(aliceChatProcessEvents.length).toBe(0);
      expect(bobUserProcessEvents.length).toBe(0);
      expect(bobChatProcessEvents.length).toBe(0);
      expect(guestUserProcessEvents.length).toBe(0);
      expect(guestChatProcessEvents.length).toBe(0);
    });

    it('close MQTT clients', () => {
      aliceMqttClient?.end();
      bobMqttClient?.end();
      guestMqttClient?.end();
    });
  });
}
