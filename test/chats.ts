import { auth, api, get, wallets, connectMqtt, waitForQueuesEmpty, assertValidProcessEvents, groupByResourceName, type ProcessEvent, type MqttClient, BASE_URL } from './helpers';
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
    let paidScenarioId: string;
    let paidChatId: string;
    let guestSponsoredChatId: string;
    let paidSponsorshipId: string;
    let guestFreeChatId: string;
    let paidTtsProviderId: string;
    let paidTtsVoiceId: string;
    let paidAvatarId: string;
    let paidAvatarChatId: string;

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

    it('queues are empty before chats tests', async () => {
      await waitForQueuesEmpty(60000);
      expect(aliceUserProcessEvents.length).toBe(0);
      expect(aliceChatProcessEvents.length).toBe(0);
      expect(bobUserProcessEvents.length).toBe(0);
      expect(bobChatProcessEvents.length).toBe(0);
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

    // ─── Token enforcement ────────────────────────────────────────

    it('guest has 0 tokenSpendable', async () => {
      const { status, body } = await api('GET', '/users/me', auth.guest.jwt);
      expect(status).toBe(200);
      expect(body.tokenSpendable).toBe(0);
    });

    it('guest CAN create a chat with free scenario + free avatar', async () => {
      const { status, body } = await api('POST', '/chats', auth.guest.jwt, {
        avatarId: hanaId,
        scenarioId: smallTalkScenarioId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', smallTalkScenarioId);
      guestFreeChatId = body.id;
    });

    it('guest deletes the free chat', async () => {
      const { status } = await api('DELETE', `/chats/${guestFreeChatId}`, auth.guest.jwt);
      expect(status).toBe(200);
    });

    // ─── Non-free avatar with free scenario ─────────────────────

    it('admin creates a paid TTS provider', async () => {
      const { status, body } = await api('POST', '/tts-providers', auth.admin.jwt, {
        name: 'PaidTTS', dollarPerCharacter: 0.001,
      });
      expect(status).toBe(200);
      paidTtsProviderId = body.id;
    });

    it('admin creates a paid TTS voice', async () => {
      const { status, body } = await api('POST', '/tts-voices', auth.admin.jwt, {
        name: 'PaidVoice', providerVoiceId: 'paid-voice-1', ttsProviderId: paidTtsProviderId,
      });
      expect(status).toBe(200);
      paidTtsVoiceId = body.id;
    });

    it('alice creates a paid avatar (non-free TTS voice)', async () => {
      const { status, body } = await api('POST', '/avatars', auth.alice.jwt, {
        name: 'PaidAvatar', shortDesc: 'Costs money', character: 'expensive', ttsVoiceId: paidTtsVoiceId, published: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('free', false);
      paidAvatarId = body.id;
    });

    it('guest cannot create a chat with free scenario + paid avatar (no tokens)', async () => {
      const { status, body } = await api('POST', '/chats', auth.guest.jwt, {
        avatarId: paidAvatarId,
        scenarioId: smallTalkScenarioId,
      });
      expect(status).toBe(403);
      expect(body.error).toContain('Insufficient');
    });

    it('alice can create a chat with free scenario + paid avatar (has tokens)', async () => {
      const { status, body } = await api('POST', '/chats', auth.alice.jwt, {
        avatarId: paidAvatarId,
        scenarioId: smallTalkScenarioId,
        tts: false,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', smallTalkScenarioId);
      expect(body).toHaveProperty('tts', false);
      paidAvatarChatId = body.id;
    });

    it('guest cannot create a chat with paid scenario + paid avatar', async () => {
      // Recreate paid scenario and avatar for this test
      const { body: chatModels } = await api('GET', '/chat-models', auth.admin.jwt);
      const { body: paidScen } = await api('POST', '/scenarios', auth.admin.jwt, {
        name: 'Paid Combo Scenario', systemMessage: 'test', chatModelId: chatModels.data[0].id,
        dollarPerMessage: 0.05, published: true,
      });
      const { body: paidAv } = await api('POST', '/avatars', auth.alice.jwt, {
        name: 'PaidComboAvatar', shortDesc: 'test', character: 'test', ttsVoiceId: paidTtsVoiceId, published: true,
      });
      const { status } = await api('POST', '/chats', auth.guest.jwt, {
        avatarId: paidAv.id, scenarioId: paidScen.id,
      });
      expect(status).toBe(403);
      // Cleanup
      await api('DELETE', `/avatars/${paidAv.id}`, auth.alice.jwt);
      await api('DELETE', `/scenarios/${paidScen.id}`, auth.admin.jwt);
    });

    it('cleanup paid avatar chat', async () => {
      await api('DELETE', `/chats/${paidAvatarChatId}`, auth.alice.jwt);
      await api('DELETE', `/avatars/${paidAvatarId}`, auth.alice.jwt);
      await api('DELETE', `/tts-voices/${paidTtsVoiceId}`, auth.admin.jwt);
      await api('DELETE', `/tts-providers/${paidTtsProviderId}`, auth.admin.jwt);
    });

    // ─── Non-free scenario with free avatar ─────────────────────

    it('admin creates a paid scenario (dollarPerMessage 0.05)', async () => {
      const { body: chatModels } = await api('GET', '/chat-models', auth.admin.jwt);
      const chatModel = chatModels.data[0];

      const { status, body } = await api('POST', '/scenarios', auth.admin.jwt, {
        name: 'Paid Scenario',
        systemMessage: 'You are a paid assistant.',
        chatModelId: chatModel.id,
        dollarPerMessage: 0.05,
        published: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('free', false);
      expect(Number(body.dollarPerMessage)).toBeCloseTo(0.05);
      paidScenarioId = body.id;
    });

    it('guest cannot create a chat with paid scenario (no tokens, no sponsorship)', async () => {
      const { status, body } = await api('POST', '/chats', auth.guest.jwt, {
        avatarId: hanaId,
        scenarioId: paidScenarioId,
      });
      expect(status).toBe(403);
      expect(body.error).toContain('Insufficient');
    });

    it('alice can create a chat with paid scenario (has tokens)', async () => {
      const { status, body } = await api('POST', '/chats', auth.alice.jwt, {
        avatarId: hanaId,
        scenarioId: paidScenarioId,
        tts: false,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      paidChatId = body.id;
    });

    it('alice creates a sponsorship for the paid scenario', async () => {
      const { status, body } = await api('POST', '/sponsorships', auth.alice.jwt, {
        scenarioId: paidScenarioId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      paidSponsorshipId = body.id;
    });

    it('guest CAN create a chat with sponsored paid scenario', async () => {
      const { status, body } = await api('POST', '/chats', auth.guest.jwt, {
        avatarId: hanaId,
        scenarioId: paidScenarioId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', paidScenarioId);
      guestSponsoredChatId = body.id;
    });

    it('alice deletes the sponsorship', async () => {
      const { status } = await api('DELETE', `/sponsorships/${paidSponsorshipId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('guest cannot create another chat after sponsorship removed', async () => {
      const { status, body } = await api('POST', '/chats', auth.guest.jwt, {
        avatarId: hanaId,
        scenarioId: paidScenarioId,
      });
      expect(status).toBe(403);
      expect(body.error).toContain('Insufficient');
    });

    // ─── Cleanup paid test data ─────────────────────────────────

    it('admin deletes paid scenario chats', async () => {
      if (paidChatId) {
        const { status } = await api('DELETE', `/chats/${paidChatId}`, auth.alice.jwt);
        expect(status).toBe(200);
      }
      if (guestSponsoredChatId) {
        const { status } = await api('DELETE', `/chats/${guestSponsoredChatId}`, auth.guest.jwt);
        expect(status).toBe(200);
      }
    });

    it('admin deletes paid scenario', async () => {
      const { status } = await api('DELETE', `/scenarios/${paidScenarioId}`, auth.admin.jwt);
      expect(status).toBe(200);
    });

    it('processEvents after token enforcement tests', async () => {
      await waitForQueuesEmpty(60000);
      assertValidProcessEvents(aliceUserProcessEvents);
      assertValidProcessEvents(aliceChatProcessEvents);
      const aliceUserEvents = groupByResourceName(aliceUserProcessEvents);
      const aliceChatEvents = groupByResourceName(aliceChatProcessEvents);
      expect(aliceUserEvents).toBeDefined();
      expect(aliceChatEvents).toBeDefined();
      aliceUserProcessEvents = [];
      aliceChatProcessEvents = [];
      bobUserProcessEvents = [];
      bobChatProcessEvents = [];
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

    it('aliceChatProcessEvents after hana chat creation', async () => {
      await waitForQueuesEmpty(60000);
      expect(aliceChatProcessEvents.length).toBeGreaterThan(0);
      const events = groupByResourceName(aliceChatProcessEvents);
      expect(events.Chat).toBeDefined();
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

    it('alice refreshes hanaChat system-prompt', async () => {
      const { status } = await api('PATCH', `/chats/${hanaChatId}`, auth.alice.jwt, { action: 'RefreshSystemPrompt' });
      expect(status).toBe(200);
    });

    it('aliceChatProcessEvents after hanaChat refresh', async () => {
      await waitForQueuesEmpty();
      const events = groupByResourceName(aliceChatProcessEvents);
      expect(events.Chat).toBeDefined();
      aliceChatProcessEvents = [];
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

    it('hanaChat system-prompt contains scenario systemMessage', async () => {
      const res = await fetch(`${BASE_URL}/chats/${hanaChatId}/system-prompt`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      const prompt = await res.text();
      // SmallTalk scenario has a systemMessage
      const { body: chat } = await api('GET', `/chats/${hanaChatId}`, auth.alice.jwt);
      const { body: scenario } = await api('GET', `/scenarios/${chat.scenarioId}`, auth.alice.jwt);
      expect(prompt).toContain(scenario.systemMessage);
    });

    it('hanaChat system-prompt contains avatar character', async () => {
      const res = await fetch(`${BASE_URL}/chats/${hanaChatId}/system-prompt`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      const prompt = await res.text();
      const { body: chat } = await api('GET', `/chats/${hanaChatId}`, auth.alice.jwt);
      const { body: avatar } = await api('GET', `/avatars/${chat.avatarId}`, auth.alice.jwt);
      expect(prompt).toContain(avatar.character);
    });

    it('hanaChat system-prompt contains user name', async () => {
      const res = await fetch(`${BASE_URL}/chats/${hanaChatId}/system-prompt`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      const prompt = await res.text();
      expect(prompt).toContain('Alice');
    });

    // ─── Get chat by id with includes ───────────────────────────

    it('get chat by id with includes', async () => {
      const { status, body } = await api('GET', `/chats/${hanaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.avatar).toBeDefined();
      expect(body.scenario).toBeDefined();
    });

    it('get chat by id has nested includes', async () => {
      const { status, body } = await api('GET', `/chats/${hanaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.avatar).toBeDefined();
      expect(body.scenario).toBeDefined();
      expect(body.scenario.chatModel).toBeDefined();
      expect(body.scenario.chatModel.aiProvider).toBeDefined();
      expect(body._count).toBeDefined();
      expect(typeof body._count.messages).toBe('number');
      expect(typeof body._count.chatCompletionJobs).toBe('number');
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

    // ─── PATCH validation ────────────────────────────────────────

    it('PATCH chat with non-existent scenarioId returns 404', async () => {
      const { status, body } = await api('PATCH', `/chats/${hanaChatId}`, auth.alice.jwt, {
        scenarioId: '00000000-0000-0000-0000-000000000000',
      });
      expect(status).toBe(404);
      expect(body.error).toContain('Scenario not found');
    });

    it('PATCH chat with non-existent avatarId returns 404', async () => {
      const { status, body } = await api('PATCH', `/chats/${hanaChatId}`, auth.alice.jwt, {
        avatarId: '00000000-0000-0000-0000-000000000000',
      });
      expect(status).toBe(404);
      expect(body.error).toContain('Avatar not found');
    });

    it('PATCH chat with non-existent sttProviderId returns 404', async () => {
      const { status, body } = await api('PATCH', `/chats/${hanaChatId}`, auth.alice.jwt, {
        sttProviderId: '00000000-0000-0000-0000-000000000000',
      });
      expect(status).toBe(404);
      expect(body.error).toContain('STT Provider not found');
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
      await waitForQueuesEmpty(60000);
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

    it('aliceChatProcessEvents after joi chat creation', async () => {
      await waitForQueuesEmpty(60000);
      expect(aliceChatProcessEvents.length).toBeGreaterThan(0);
      const events = groupByResourceName(aliceChatProcessEvents);
      expect(events.Chat).toBeDefined();
      aliceChatProcessEvents = [];
    });

    it('alice gets 2 chats', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(2);
    });

    it('alice refreshes joiChat system-prompt', async () => {
      const { status } = await api('PATCH', `/chats/${joiChatId}`, auth.alice.jwt, { action: 'RefreshSystemPrompt' });
      expect(status).toBe(200);
    });

    it('aliceChatProcessEvents after joiChat refresh', async () => {
      await waitForQueuesEmpty();
      const events = groupByResourceName(aliceChatProcessEvents);
      expect(events.Chat).toBeDefined();
      aliceChatProcessEvents = [];
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

    it('bobChatProcessEvents after freya chat creation', async () => {
      await waitForQueuesEmpty(60000);
      expect(bobChatProcessEvents.length).toBeGreaterThan(0);
      const events = groupByResourceName(bobChatProcessEvents);
      expect(events.Chat).toBeDefined();
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

    it('aliceChatProcessEvents after joiChat sttProvider update', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(aliceChatProcessEvents);
      const chatEvents = events.Chat || [];
      expect(chatEvents.length).toBeGreaterThanOrEqual(2);
      expect(chatEvents.some((e: ProcessEvent) => e.jobStatus === 'active')).toBe(true);
      expect(chatEvents.some((e: ProcessEvent) => e.jobStatus === 'completed')).toBe(true);
      aliceChatProcessEvents = [];
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
      await waitForQueuesEmpty(60000);
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
      await waitForQueuesEmpty(60000);
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

    let guestFreeChatId2: string;
    it('guest can still create a chat with free scenario + free avatar', async () => {
      const { status, body } = await api('POST', '/chats', auth.guest.jwt, {
        avatarId: hanaId,
        scenarioId: smallTalkScenarioId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', smallTalkScenarioId);
      guestFreeChatId2 = body.id;
    });

    it('guest deletes the free chat after token balance test', async () => {
      await api('DELETE', `/chats/${guestFreeChatId2}`, auth.guest.jwt);
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

    it('aliceChatProcessEvents after alien chat creation', async () => {
      await waitForQueuesEmpty(60000);
      expect(aliceChatProcessEvents.length).toBeGreaterThan(0);
      const events = groupByResourceName(aliceChatProcessEvents);
      expect(events.Chat).toBeDefined();
      aliceChatProcessEvents = [];
    });

    it('alice gets the alien chat with sttProvider assigned', async () => {
      const { status, body } = await api('GET', `/chats/${alienChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('scenarioId', alienScenarioId);
      expect(body).toHaveProperty('sttProviderId');
    });

    // ─── Alien ROLEPLAY system prompt ───────────────────────────

    it('alice refreshes alien chat system-prompt', async () => {
      const { status } = await api('PATCH', `/chats/${alienChatId}`, auth.alice.jwt, { action: 'RefreshSystemPrompt' });
      expect(status).toBe(200);
    });

    it('aliceChatProcessEvents after alien chat refresh', async () => {
      await waitForQueuesEmpty();
      const events = groupByResourceName(aliceChatProcessEvents);
      expect(events.Chat).toBeDefined();
      aliceChatProcessEvents = [];
    });

    it('alien chat system-prompt uses roleplay template', async () => {
      const res = await fetch(`${BASE_URL}/chats/${alienChatId}/system-prompt`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      expect(res.status).toBe(200);
      const prompt = await res.text();
      expect(prompt).toContain('immersive roleplay');
      expect(prompt).toContain('### Roleplay Rules');
      expect(prompt).toContain('Stay fully in character');
      // Roleplay template should NOT contain normal-only sections
      expect(prompt).not.toContain('### Doll Status');
      expect(prompt).not.toContain('### DollBody');
      expect(prompt).not.toContain('### Date and Time');
    });

    it('alien chat system-prompt contains avatar name and character', async () => {
      const res = await fetch(`${BASE_URL}/chats/${alienChatId}/system-prompt`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      const prompt = await res.text();
      const { body: chat } = await api('GET', `/chats/${alienChatId}`, auth.alice.jwt);
      const { body: avatar } = await api('GET', `/avatars/${chat.avatarId}`, auth.alice.jwt);
      expect(prompt).toContain(avatar.name);
      expect(prompt).toContain(avatar.character);
    });

    it('alien chat system-prompt contains scenario name and systemMessage', async () => {
      const res = await fetch(`${BASE_URL}/chats/${alienChatId}/system-prompt`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      const prompt = await res.text();
      const { body: scenario } = await api('GET', `/scenarios/${alienScenarioId}`, auth.alice.jwt);
      expect(prompt).toContain(scenario.name);
      expect(prompt).toContain(scenario.systemMessage);
    });

    it('alien chat system-prompt contains user name', async () => {
      const res = await fetch(`${BASE_URL}/chats/${alienChatId}/system-prompt`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      const prompt = await res.text();
      expect(prompt).toContain('Alice');
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

    it('no unprocessed events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      if (aliceUserProcessEvents.length > 0) console.log('Unprocessed alice user events:', aliceUserProcessEvents.length, aliceUserProcessEvents);
      if (aliceChatProcessEvents.length > 0) console.log('Unprocessed alice chat events:', aliceChatProcessEvents.length, aliceChatProcessEvents);
      if (bobUserProcessEvents.length > 0) console.log('Unprocessed bob user events:', bobUserProcessEvents.length, bobUserProcessEvents);
      if (bobChatProcessEvents.length > 0) console.log('Unprocessed bob chat events:', bobChatProcessEvents.length, bobChatProcessEvents);
      expect(aliceUserProcessEvents.length).toBe(0);
      expect(aliceChatProcessEvents.length).toBe(0);
      expect(bobUserProcessEvents.length).toBe(0);
      expect(bobChatProcessEvents.length).toBe(0);
    });

    it('close MQTT clients', () => {
      aliceMqttClient?.end();
      bobMqttClient?.end();
    });
  });
}
