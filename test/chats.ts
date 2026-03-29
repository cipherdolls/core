import { auth, api, get, wallets, connectMqtt, waitForEvents, groupByResourceName, type ProcessEvent, type MqttClient, BASE_URL } from './helpers';
import { joiAvatarId } from './avatars';

export let hanaChatId: string;
export let joiChatId: string;
export let freyaChatId: string;

export function describeChats() {
  describe('Chats', () => {
    let aliceMqttClient: MqttClient;
    let aliceUserProcessEvents: ProcessEvent[] = [];
    let aliceChatProcessEvents: ProcessEvent[] = [];

    let bobMqttClient: MqttClient;
    let bobUserProcessEvents: ProcessEvent[] = [];
    let bobChatProcessEvents: ProcessEvent[] = [];

    // Resolved seed data
    let hanaId: string;
    let freyaId: string;
    let smallTalkScenarioId: string;
    let bobDeepTalkScenarioId: string;
    let alienScenarioId: string;
    let sttProviderId: string; // first stt provider (for update test)

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect alice MQTT client and subscribe to user topic', async () => {
      const userScoped = new Set(['Transaction', 'User']);
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
      aliceMqttClient.subscribe(`users/${auth.alice.userId}/processEvents`);
      aliceMqttClient.on('message', (_topic, msg) => {
        const event = JSON.parse(msg.toString()) as ProcessEvent;
        if (userScoped.has(event.resourceName)) {
          aliceUserProcessEvents.push(event);
        } else {
          aliceChatProcessEvents.push(event);
        }
      });
    });

    it('connect bob MQTT client and subscribe to user topic', async () => {
      const userScoped = new Set(['Transaction', 'User']);
      bobMqttClient = await connectMqtt(auth.bob.jwt);
      bobMqttClient.subscribe(`users/${auth.bob.userId}/processEvents`);
      bobMqttClient.on('message', (_topic, msg) => {
        const event = JSON.parse(msg.toString()) as ProcessEvent;
        if (userScoped.has(event.resourceName)) {
          bobUserProcessEvents.push(event);
        } else {
          bobChatProcessEvents.push(event);
        }
      });
    });

    // ─── Drain late events from previous modules ────────────────

    it('drain late events from previous modules', async () => {
      await new Promise((r) => setTimeout(r, 2000));
      aliceUserProcessEvents = [];
      aliceChatProcessEvents = [];
      bobUserProcessEvents = [];
      bobChatProcessEvents = [];
    });

    // ─── Resolve seed data ──────────────────────────────────────

    it('resolve seed avatars', async () => {
      const { body: avatars } = await api('GET', '/avatars', auth.alice.jwt);
      const hana = avatars.data.find((a: any) => a.name === 'Hana');
      const freya = avatars.data.find((a: any) => a.name === 'Freya');
      expect(hana).toBeTruthy();
      expect(freya).toBeTruthy();
      hanaId = hana.id;
      freyaId = freya.id;
    });

    it('resolve seed scenarios', async () => {
      const { body: scenarios } = await api('GET', '/scenarios', auth.alice.jwt);
      const smallTalk = scenarios.data.find((s: any) => s.name === 'Small Talk');
      expect(smallTalk).toBeTruthy();
      smallTalkScenarioId = smallTalk.id;

      const { body: nsfwScenarios } = await api('GET', '/scenarios?published=true&nsfw=true', auth.bob.jwt);
      const deepTalk = nsfwScenarios.data[0];
      expect(deepTalk).toBeTruthy();
      bobDeepTalkScenarioId = deepTalk.id;

      const alienBeliever = scenarios.data.find((s: any) => s.name === 'Alien Believer');
      expect(alienBeliever).toBeTruthy();
      alienScenarioId = alienBeliever.id;
    });

    it('resolve stt providers', async () => {
      const { body: sttProviders } = await api('GET', '/stt-providers', auth.admin.jwt);
      expect(sttProviders.data.length).toBeGreaterThan(0);
      sttProviderId = sttProviders.data[0].id;
    });

    // ─── Empty state ────────────────────────────────────────────

    it('alice get 0 chats', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── Alice creates hana chat ────────────────────────────────

    it('alice create a hana SmallTalk Chat', async () => {
      const { status, body } = await api('POST', '/chats', auth.alice.jwt, {
        avatarId: hanaId,
        scenarioId: smallTalkScenarioId,
        tts: false,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', smallTalkScenarioId);
      expect(body).toHaveProperty('tts', false);
      hanaChatId = body.id;
      aliceMqttClient.subscribe(`chats/${hanaChatId}/processEvents`);
    });

    it('drain aliceChatProcessEvents after hana chat creation', async () => {
      await new Promise(r => setTimeout(r, 1000));
      aliceChatProcessEvents = [];
    });

    it('aliceUserProcessEvents contains 0 Events after hana create', async () => {
      expect(aliceUserProcessEvents.length).toBe(0);
      aliceUserProcessEvents = [];
    });

    it('alice get the hanaChat', async () => {
      const { status, body } = await api('GET', `/chats/${hanaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('scenarioId', smallTalkScenarioId);
      expect(body).toHaveProperty('sttProviderId');
    });

    it('alice get the hanaChat system-prompt', async () => {
      const res = await fetch(`${BASE_URL}/chats/${hanaChatId}/system-prompt`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      expect(res.status).toBe(200);
      const prompt = await res.text();
      expect(prompt).toContain('### Introduction');
      expect(prompt).toContain('### Avatar Personality');
      expect(prompt).toContain('### User');
      expect(prompt).toContain('### Scenario');
    });

    // ─── Get chat by id with includes ───────────────────────────

    it('get chat by id with includes', async () => {
      const { status, body } = await api('GET', `/chats/${hanaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.avatar).toBeDefined();
      expect(body.scenario).toBeDefined();
    });

    // ─── Greeting message ───────────────────────────────────────

    let hanaChatMessage1Id: string;
    it('alice gets her 1 greeting message from hanaChat', async () => {
      const { status, body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('meta');
      expect(body.meta.hasMore).toBe(false);
      expect(body.meta.prevCursor).toBe(null);
      expect(body.meta.nextCursor).toBe(null);
      expect(body.meta.limit).toBe(10);
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
      const message = body.data[0];
      expect(message).toHaveProperty('id');
      hanaChatMessage1Id = message.id;
    });

    it('alice get the message1 by ID', async () => {
      const { status, body } = await api('GET', `/messages/${hanaChatMessage1Id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('content');
    });

    it('alice gets 1 chat', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    // ─── Update hana chat scenario ──────────────────────────────

    it('alice updates the hana Chat scenario to bobDeepTalkScenario', async () => {
      const { status, body } = await api('PATCH', `/chats/${hanaChatId}`, auth.alice.jwt, {
        avatarId: hanaId,
        scenarioId: bobDeepTalkScenarioId,
        tts: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', hanaChatId);
      expect(body).toHaveProperty('scenarioId', bobDeepTalkScenarioId);
      expect(body).toHaveProperty('tts', true);
    });

    it('aliceUserProcessEvents contains 0 Events after hana update', async () => {
      expect(aliceUserProcessEvents.length).toBe(0);
      aliceUserProcessEvents = [];
    });

    it('aliceChatProcessEvents after hana chat update', async () => {
      await waitForEvents(aliceChatProcessEvents, 2, 15000);
      const events = groupByResourceName(aliceChatProcessEvents);
      const chatEvents = events.Chat || [];
      expect(chatEvents.length).toBeGreaterThanOrEqual(2);
      expect(chatEvents.some((e: ProcessEvent) => e.jobStatus === 'active')).toBe(true);
      expect(chatEvents.some((e: ProcessEvent) => e.jobStatus === 'completed')).toBe(true);
      aliceChatProcessEvents = [];
    });

    it('alice gets the hana Chat after update', async () => {
      const { status, body } = await api('GET', `/chats/${hanaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', hanaChatId);
      expect(body).toHaveProperty('scenarioId', bobDeepTalkScenarioId);
      expect(body).toHaveProperty('sttProviderId');
    });

    it('alice still has 1 chat after update', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    // ─── Avatar visibility (alice sees hana + freya) ────────────

    it('alice get all avatars her and published', async () => {
      const { status, body } = await api('GET', '/avatars', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);

      const hana = body.data.find((a: any) => a.name === 'Hana');
      const freya = body.data.find((a: any) => a.name === 'Freya');
      expect(hana).toBeTruthy();
      expect(freya).toBeTruthy();
      expect(hana.published).toBe(true);
      expect(freya.published).toBe(true);
      expect(body.meta.total).toBe(2);
    });

    // ─── Alice creates joi chat ─────────────────────────────────

    it('alice creates the joi Chat with bobDeepTalkScenario', async () => {
      const { status, body } = await api('POST', '/chats', auth.alice.jwt, {
        avatarId: joiAvatarId,
        scenarioId: bobDeepTalkScenarioId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', bobDeepTalkScenarioId);
      joiChatId = body.id;
      aliceMqttClient.subscribe(`chats/${joiChatId}/processEvents`);
    });

    it('aliceUserProcessEvents contains 0 Events after joi create', async () => {
      expect(aliceUserProcessEvents.length).toBe(0);
      aliceUserProcessEvents = [];
    });

    it('drain aliceChatProcessEvents after joi chat creation', async () => {
      await new Promise(r => setTimeout(r, 1000));
      aliceChatProcessEvents = [];
    });

    it('alice gets 2 chats', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(2);
    });

    it('alice get the joiChat system-prompt', async () => {
      const res = await fetch(`${BASE_URL}/chats/${joiChatId}/system-prompt`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      expect(res.status).toBe(200);
      const prompt = await res.text();
      expect(prompt).toContain('### Introduction');
      expect(prompt).toContain('### Avatar Personality');
      expect(prompt).toContain('### User');
      expect(prompt).toContain('### Scenario');
    });

    let joiChatMessage1Id: string;
    it('alice gets her 1 greeting message from joiChat', async () => {
      const { status, body } = await api('GET', `/messages?chatId=${joiChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('meta');
      expect(body.meta.hasMore).toBe(false);
      expect(body.meta.prevCursor).toBe(null);
      expect(body.meta.nextCursor).toBe(null);
      expect(body.meta.limit).toBe(10);
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
      const message = body.data[0];
      expect(message).toHaveProperty('id');
      joiChatMessage1Id = message.id;
    });

    it('alice get the joiChatMessage 1 by ID', async () => {
      const { status, body } = await api('GET', `/messages/${joiChatMessage1Id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('content');
    });

    // ─── Bob creates freya chat ─────────────────────────────────

    it('should get the current token balance of bob', async () => {
      const { status, body } = await api('GET', '/users/me', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(100);
      expect(body.tokenAllowance).toBe(2);
    });

    it('bob create a freya Chat with bobDeepTalkScenario', async () => {
      const { body: avatars } = await api('GET', '/avatars?published=true', auth.bob.jwt);
      const freya = avatars.data.find((a: any) => a.name === 'Freya');

      const { status, body } = await api('POST', '/chats', auth.bob.jwt, {
        avatarId: freya.id,
        scenarioId: bobDeepTalkScenarioId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', bobDeepTalkScenarioId);
      freyaChatId = body.id;
      bobMqttClient.subscribe(`chats/${freyaChatId}/processEvents`);
    });

    it('bobUserProcessEvents contains 0 Events after freya create', async () => {
      expect(bobUserProcessEvents.length).toBe(0);
      bobUserProcessEvents = [];
    });

    it('drain bobChatProcessEvents after freya chat creation', async () => {
      await new Promise(r => setTimeout(r, 1000));
      bobChatProcessEvents = [];
    });

    // ─── Avatar visibility with active chat avatars ─────────────

    it('alice get all avatars her and published and the active avatar in her chat', async () => {
      const { status, body } = await api('GET', '/avatars', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(3);

      const hana = body.data.find((a: any) => a.name === 'Hana');
      const joi = body.data.find((a: any) => a.name === 'Joi');
      const freya = body.data.find((a: any) => a.name === 'Freya');

      expect(hana).toBeTruthy();
      expect(freya).toBeTruthy();
      expect(joi).toBeTruthy();

      expect(hana.published).toBe(true);
      expect(freya.published).toBe(true);
      expect(joi.published).toBe(false);
    });

    it('alice still has two chats', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(2);
    });

    it('bob get all avatars his and published and the active avatar in his chat', async () => {
      const { status, body } = await api('GET', '/avatars', auth.bob.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);

      const hana = body.data.find((a: any) => a.name === 'Hana');
      const freya = body.data.find((a: any) => a.name === 'Freya');
      const joi = body.data.find((a: any) => a.name === 'Joi');

      expect(hana).toBeFalsy();
      expect(freya).toBeTruthy();
      expect(joi).toBeTruthy();

      expect(freya?.published).toBe(true);
      expect(joi?.published).toBe(false);
    });

    it('bob get his one chat', async () => {
      const { status, body } = await api('GET', '/chats', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    it('bob gets 1 message from his 1 chat', async () => {
      const { status, body } = await api('GET', `/messages?chatId=${freyaChatId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('meta');
      expect(body.meta.hasMore).toBe(false);
      expect(body.meta.prevCursor).toBe(null);
      expect(body.meta.nextCursor).toBe(null);
      expect(body.meta.limit).toBe(10);
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    // ─── Bob access denied ──────────────────────────────────────

    it('bob dont get the hanaChat', async () => {
      const { status } = await api('GET', `/chats/${hanaChatId}`, auth.bob.jwt);
      expect(status).toBe(404);
    });

    it('bob dont get the hanaChat through the hana avatar', async () => {
      const { status, body } = await api('GET', `/avatars/${hanaId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.chats).not.toEqual(expect.arrayContaining([expect.objectContaining({ avatarId: hanaId })]));
    });

    it('bob can not delete the hanaChat', async () => {
      const { status } = await api('DELETE', `/chats/${hanaChatId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    // ─── Update sttProvider ─────────────────────────────────────

    it('alice updates the joiChat sttProvider', async () => {
      const { status, body } = await api('PATCH', `/chats/${joiChatId}`, auth.alice.jwt, {
        avatarId: joiAvatarId,
        scenarioId: bobDeepTalkScenarioId,
        sttProviderId: sttProviderId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('sttProviderId', sttProviderId);
    });

    // ─── Create + delete custom joi chat ────────────────────────

    let customJoiChatId: string;
    it('alice creates the joi Chat but with smallTalkScenario', async () => {
      const { status, body } = await api('POST', '/chats', auth.alice.jwt, {
        avatarId: joiAvatarId,
        scenarioId: smallTalkScenarioId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', smallTalkScenarioId);
      customJoiChatId = body.id;
      aliceMqttClient.subscribe(`chats/${customJoiChatId}/processEvents`);
    });

    it('aliceUserProcessEvents contains 0 Events after customJoiChat create', async () => {
      expect(aliceUserProcessEvents.length).toBe(0);
      aliceUserProcessEvents = [];
    });

    it('aliceChatProcessEvents after customJoiChat creation', async () => {
      await waitForEvents(aliceChatProcessEvents, 2, 15000);
      const events = groupByResourceName(aliceChatProcessEvents);
      const chatEvents = events.Chat || [];
      expect(chatEvents.length).toBeGreaterThanOrEqual(2);
      aliceChatProcessEvents = [];
    });

    it('alice delete the custom joiChat', async () => {
      const { status } = await api('DELETE', `/chats/${customJoiChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('aliceChatProcessEvents after custom joiChat delete', async () => {
      await waitForEvents(aliceChatProcessEvents, 2, 15000);
      const events = groupByResourceName(aliceChatProcessEvents);
      const chatEvents = events.Chat || [];
      expect(chatEvents.length).toBeGreaterThanOrEqual(2);
      aliceChatProcessEvents = [];
    });

    it('aliceUserProcessEvents contains 0 Events after delete', async () => {
      expect(aliceUserProcessEvents.length).toBe(0);
      aliceUserProcessEvents = [];
    });

    it('alice still has 2 chats after custom delete', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(2);
    });

    // ─── 401 — Unauthenticated access ──────────────────────────

    it('GET /chats without JWT returns 401', async () => {
      const { status } = await get('/chats');
      expect(status).toBe(401);
    });

    it('GET /chats/:id without JWT returns 401', async () => {
      const { status } = await get(`/chats/${hanaChatId}`);
      expect(status).toBe(401);
    });

    it('POST /chats without JWT returns 401', async () => {
      const res = await fetch(`${BASE_URL}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId: hanaId, scenarioId: smallTalkScenarioId }),
      });
      expect(res.status).toBe(401);
    });

    it('PATCH /chats/:id without JWT returns 401', async () => {
      const res = await fetch(`${BASE_URL}/chats/${hanaChatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: bobDeepTalkScenarioId }),
      });
      expect(res.status).toBe(401);
    });

    it('DELETE /chats/:id without JWT returns 401', async () => {
      const res = await fetch(`${BASE_URL}/chats/${hanaChatId}`, { method: 'DELETE' });
      expect(res.status).toBe(401);
    });

    it('GET /chats/:id/system-prompt without JWT returns 401', async () => {
      const res = await fetch(`${BASE_URL}/chats/${hanaChatId}/system-prompt`);
      expect(res.status).toBe(401);
    });

    // ─── 404 — Non-existent resources ───────────────────────────

    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    it('GET /chats/:id with non-existent id returns 404', async () => {
      const { status } = await api('GET', `/chats/${nonExistentId}`, auth.alice.jwt);
      expect(status).toBe(404);
    });

    it('GET /chats/:id/system-prompt with non-existent id returns 404', async () => {
      const res = await fetch(`${BASE_URL}/chats/${nonExistentId}/system-prompt`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      expect(res.status).toBe(404);
    });

    it('POST /chats with non-existent avatarId returns 404', async () => {
      const { status } = await api('POST', '/chats', auth.alice.jwt, {
        avatarId: nonExistentId,
        scenarioId: smallTalkScenarioId,
      });
      expect(status).toBe(404);
    });

    it('POST /chats with non-existent scenarioId returns 404', async () => {
      const { status } = await api('POST', '/chats', auth.alice.jwt, {
        avatarId: hanaId,
        scenarioId: nonExistentId,
      });
      expect(status).toBe(404);
    });

    // ─── 403 — Cross-user authorization ─────────────────────────

    it('bob can not update alice hanaChat (403)', async () => {
      const { status } = await api('PATCH', `/chats/${hanaChatId}`, auth.bob.jwt, {
        avatarId: hanaId,
        scenarioId: bobDeepTalkScenarioId,
      });
      expect(status).toBe(403);
    });

    it('bob can not get alice hanaChat system-prompt (404)', async () => {
      const res = await fetch(`${BASE_URL}/chats/${hanaChatId}/system-prompt`, {
        headers: { Authorization: `Bearer ${auth.bob.jwt}` },
      });
      expect(res.status).toBe(404);
    });

    // ─── 403 — Token balance enforcement ────────────────────────

    it('guest has 0 tokenSpendable', async () => {
      const { status, body } = await api('GET', '/users/me', auth.guest.jwt);
      expect(status).toBe(200);
      expect(body.tokenSpendable).toBe(0);
    });

    it('guest can not create a chat without tokens or sponsorship (403)', async () => {
      const { status } = await api('POST', '/chats', auth.guest.jwt, {
        avatarId: hanaId,
        scenarioId: smallTalkScenarioId,
      });
      expect(status).toBe(403);
    });

    // ─── Alien ROLEPLAY chat ────────────────────────────────────

    let alienChatId: string;
    it('alice creates an alien ROLEPLAY chat with hana', async () => {
      const { status, body } = await api('POST', '/chats', auth.alice.jwt, {
        avatarId: hanaId,
        scenarioId: alienScenarioId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', alienScenarioId);
      alienChatId = body.id;
      aliceMqttClient.subscribe(`chats/${alienChatId}/processEvents`);
    });

    it('aliceUserProcessEvents contains 0 Events after alien chat create', async () => {
      expect(aliceUserProcessEvents.length).toBe(0);
      aliceUserProcessEvents = [];
    });

    it('drain aliceChatProcessEvents after alien chat creation', async () => {
      await new Promise(r => setTimeout(r, 1000));
      aliceChatProcessEvents = [];
    });

    it('alice gets the alien chat with sttProvider assigned', async () => {
      const { status, body } = await api('GET', `/chats/${alienChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('scenarioId', alienScenarioId);
      expect(body).toHaveProperty('sttProviderId');
    });

    // ─── Final counts ───────────────────────────────────────────

    it('alice still has 3 chats after edge-case tests', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(3);
    });

    it('bob still has 1 chat after edge-case tests', async () => {
      const { status, body } = await api('GET', '/chats', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    it('guest has 0 chats', async () => {
      const { status, body } = await api('GET', '/chats', auth.guest.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    // ─── MQTT cleanup ───────────────────────────────────────────

    it('drain remaining MQTT events', async () => {
      await new Promise((r) => setTimeout(r, 1000));
      aliceUserProcessEvents = [];
      aliceChatProcessEvents = [];
      bobUserProcessEvents = [];
      bobChatProcessEvents = [];
    });

    it('close MQTT clients', () => {
      aliceMqttClient?.end();
      bobMqttClient?.end();
    });
  });
}
