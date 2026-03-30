
import { auth, api, get, connectMqtt, waitForEvents, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient } from './helpers';

export let hanaAvatarId: string;
export let freyaAvatarId: string;
export let joiAvatarId: string;

export function describeAvatars() {
  describe('Avatars', () => {
    let aliceMqttClient: MqttClient;
    let aliceUserProcessEvents: ProcessEvent[] = [];

    let bobMqttClient: MqttClient;
    let bobUserProcessEvents: ProcessEvent[] = [];

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect alice MQTT client for avatars', async () => {
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
      aliceMqttClient.subscribe(`users/${auth.alice.userId}/processEvents`);
      aliceMqttClient.on('message', (_topic, msg) => {
        aliceUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    it('connect bob MQTT client for avatars', async () => {
      bobMqttClient = await connectMqtt(auth.bob.jwt);
      bobMqttClient.subscribe(`users/${auth.bob.userId}/processEvents`);
      bobMqttClient.on('message', (_topic, msg) => {
        bobUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    it('aliceUserProcessEvents contains 0 Events initially', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 0);
      expect(aliceUserProcessEvents.length).toBe(0);
      aliceUserProcessEvents = [];
    });

    it('bobUserProcessEvents contains 0 Events initially', async () => {
      await waitForEvents<ProcessEvent>(bobUserProcessEvents, 0);
      expect(bobUserProcessEvents.length).toBe(0);
      bobUserProcessEvents = [];
    });

    // ─── Token balance enforcement ─────────────────────────────

    it('guest has 0 tokenSpendable', async () => {
      const { status, body } = await api('GET', '/users/me', auth.guest.jwt);
      expect(status).toBe(200);
      expect(body.tokenSpendable).toBe(0);
    });

    it('guest can not create an avatar without spendable tokens (403)', async () => {
      const { body: voices } = await api('GET', '/tts-voices', auth.guest.jwt);
      const ttsVoiceId = voices.data[0].id;

      const { body: scenarios } = await api('GET', '/scenarios?published=true&nsfw=true', auth.guest.jwt);
      const scenarioId = scenarios.data[0].id;

      const { status } = await api('POST', '/avatars', auth.guest.jwt, {
        name: 'GuestAvatar',
        shortDesc: 'Test',
        character: 'Test',
        ttsVoiceId,
        gender: 'Female',
        scenarioIds: [scenarioId],
      });
      expect(status).toBe(403);
    });

    it('guest has 0 avatars', async () => {
      const { status, body } = await api('GET', '/avatars', auth.guest.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    // ─── Empty state ───────────────────────────────────────────

    it('get alice empty avatars', async () => {
      const { status, body } = await api('GET', '/avatars', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(0);
      expect(body.meta.page).toBe(1);
      expect(body.data.length).toBe(0);
    });

    it('get bob empty avatars', async () => {
      const { status, body } = await api('GET', '/avatars', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(0);
      expect(body.data.length).toBe(0);
    });

    // ─── Alice creates Hana ────────────────────────────────────

    it('alice post a private hana avatar with SmallTalk scenario', async () => {
      const { body: voices } = await api('GET', '/tts-voices', auth.alice.jwt);
      const ttsVoiceId = voices.data[0].id;

      const { body: scenarios } = await api('GET', '/scenarios', auth.alice.jwt);
      const scenarioId = scenarios.data[0].id;

      const { status, body } = await api('POST', '/avatars', auth.alice.jwt, {
        name: 'Hana',
        shortDesc: 'Hana the Empathetic',
        character: 'Empathetic, nurturing, calm',
        ttsVoiceId,
        published: false,
        recommended: false,
        language: 'en',
        gender: 'Female',
        scenarioIds: [scenarioId],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Hana');
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('userId', auth.alice.userId);
      expect(body).toHaveProperty('ttsVoiceId', ttsVoiceId);
      expect(body).toHaveProperty('gender', 'Female');
      expect(body).toHaveProperty('scenarios');
      expect(Array.isArray(body.scenarios)).toBe(true);
      expect(body.scenarios).toHaveLength(1);
      hanaAvatarId = body.id;
    });

    it('aliceUserProcessEvents contains >= 2 Avatar events after hana create', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 2);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const avatar = processEvents.Avatar || [];
      expect(avatar.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('alice gets her private hana avatar', async () => {
      const { status, body } = await api('GET', `/avatars/${hanaAvatarId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', hanaAvatarId);
      expect(body).toHaveProperty('name', 'Hana');
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('free', true);
      expect(body).toHaveProperty('userId', auth.alice.userId);
    });

    // ─── Cross-user access ─────────────────────────────────────

    it('bob dont get the private alice hana avatar', async () => {
      const { status } = await api('GET', `/avatars/${hanaAvatarId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    // ─── Alice creates Freya ───────────────────────────────────

    it('alice post a private freya avatar', async () => {
      const { body: voices } = await api('GET', '/tts-voices', auth.alice.jwt);
      const ttsVoiceId = voices.data.length > 1 ? voices.data[1].id : voices.data[0].id;

      const { body: scenarios } = await api('GET', '/scenarios', auth.alice.jwt);
      const scenarioId = scenarios.data[0].id;

      const { status, body } = await api('POST', '/avatars', auth.alice.jwt, {
        name: 'Freya',
        shortDesc: 'Freya the Fun',
        character: 'Outgoing, warm-hearted, enthusiastic',
        ttsVoiceId,
        published: false,
        recommended: false,
        language: 'en',
        gender: 'Female',
        scenarioIds: [scenarioId],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Freya');
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('scenarios');
      expect(body.scenarios).toHaveLength(1);
      freyaAvatarId = body.id;
    });

    it('aliceUserProcessEvents contains >= 2 Avatar events after freya create', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 2);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const avatar = processEvents.Avatar || [];
      expect(avatar.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('alice gets her private freya avatar', async () => {
      const { status, body } = await api('GET', `/avatars/${freyaAvatarId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', freyaAvatarId);
      expect(body).toHaveProperty('name', 'Freya');
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('free', true);
      expect(body).toHaveProperty('userId', auth.alice.userId);
    });

    // ─── Update avatar voice ───────────────────────────────────

    it('alice can update the voice of freya avatar', async () => {
      const { body: voices } = await api('GET', '/tts-voices', auth.alice.jwt);
      const newVoiceId = voices.data[0].id;

      const { status, body } = await api('PATCH', `/avatars/${freyaAvatarId}`, auth.alice.jwt, {
        ttsVoiceId: newVoiceId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', freyaAvatarId);
      expect(body).toHaveProperty('ttsVoiceId', newVoiceId);
    });

    it('aliceUserProcessEvents contains 2 Events after freya voice update', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 2);
      expect(aliceUserProcessEvents.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    // ─── Bob creates Joi ───────────────────────────────────────

    it('bob post a private joi avatar with deepTalk roleplay', async () => {
      const { body: voices } = await api('GET', '/tts-voices', auth.bob.jwt);
      const ttsVoiceId = voices.data[0].id;

      const { body: scenarios } = await api('GET', '/scenarios?nsfw=true', auth.bob.jwt);
      const scenarioId = scenarios.data[0].id;

      const { status, body } = await api('POST', '/avatars', auth.bob.jwt, {
        name: 'Joi',
        shortDesc: 'Joi the Adventurous',
        character: 'Bold, adventurous, playful',
        ttsVoiceId,
        published: false,
        recommended: false,
        language: 'en',
        gender: 'Female',
        scenarioIds: [scenarioId],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Joi');
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('userId', auth.bob.userId);
      expect(body).toHaveProperty('gender', 'Female');
      expect(body.scenarios).toHaveLength(1);
      joiAvatarId = body.id;
    });

    it('bobUserProcessEvents contains >= 2 Avatar events after joi create', async () => {
      await waitForEvents<ProcessEvent>(bobUserProcessEvents, 2);
      const processEvents = groupByResourceName(bobUserProcessEvents);
      const avatar = processEvents.Avatar || [];
      expect(avatar.length).toBeGreaterThanOrEqual(2);
      bobUserProcessEvents = [];
    });

    it('bob gets private joi avatar', async () => {
      const { status, body } = await api('GET', `/avatars/${joiAvatarId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', joiAvatarId);
      expect(body).toHaveProperty('name', 'Joi');
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('free', true);
      expect(body).toHaveProperty('userId', auth.bob.userId);
    });

    // ─── Publish avatar — can't publish with private scenarios ─

    it('alice can not publish her hana avatar with private scenarios', async () => {
      const { status, body } = await api('PATCH', `/avatars/${hanaAvatarId}`, auth.alice.jwt, {
        published: true,
      });
      expect(status).toBe(400);
      expect(body).toHaveProperty('message');
      expect(body.message).toContain('avatar can only be published if all assigned scenarios are published.');
    });

    // ─── Publish hana with public scenario ─────────────────────

    it('alice can publish her hana avatar with public scenario', async () => {
      const { body: scenarios } = await api('GET', '/scenarios?published=true&nsfw=true', auth.alice.jwt);
      const publicScenarioId = scenarios.data[0].id;

      const { status, body } = await api('PATCH', `/avatars/${hanaAvatarId}`, auth.alice.jwt, {
        published: true,
        scenarioIds: [publicScenarioId],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('published', true);
      expect(body.scenarios).toHaveLength(1);
    });

    it('aliceUserProcessEvents contains 2 Events after hana publish', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 2);
      expect(aliceUserProcessEvents.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    // ─── Publish freya — can't publish with unpublished scenarios ─

    it('alice can not publish freya with unpublished scenarios', async () => {
      const { status, body } = await api('PATCH', `/avatars/${freyaAvatarId}`, auth.alice.jwt, {
        published: true,
      });
      expect(status).toBe(400);
      expect(body).toHaveProperty('statusCode', 400);
      expect(body).toHaveProperty('message');
      expect(body.message).toContain('avatar can only be published if all assigned scenarios are published.');
    });

    // ─── Publish freya with public bobDeepTalkScenario ─────────

    it('alice can publish her freya avatar with public bobDeepTalkScenario', async () => {
      const { body: scenarios } = await api('GET', '/scenarios?published=true&nsfw=true', auth.alice.jwt);
      const publicScenarioId = scenarios.data[0].id;

      const { status, body } = await api('PATCH', `/avatars/${freyaAvatarId}`, auth.alice.jwt, {
        published: true,
        scenarioIds: [publicScenarioId],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('published', true);
    });

    it('aliceUserProcessEvents contains 2 Events after freya publish', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 2);
      expect(aliceUserProcessEvents.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    // ─── Filtering tests ───────────────────────────────────────
    // State: hana (published, alice), freya (published, alice), joi (private, bob)

    it('unauthenticated user gets published hana avatar', async () => {
      const { status, body } = await get(`/avatars/${hanaAvatarId}`);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', hanaAvatarId);
      expect(body).toHaveProperty('name', 'Hana');
      expect(body).toHaveProperty('published', true);
      expect(body).toHaveProperty('free', true);
    });

    it('alice gets all her avatars (private + public)', async () => {
      const { status, body } = await api('GET', '/avatars', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(2);

      const freya = body.data.find((a: any) => a.name === 'Freya');
      const hana = body.data.find((a: any) => a.name === 'Hana');
      expect(freya).toBeTruthy();
      expect(hana).toBeTruthy();
    });

    it('alice gets all published avatars', async () => {
      const { status, body } = await api('GET', '/avatars?published=true', auth.alice.jwt);
      expect(status).toBe(200);
      const data = body.data;
      expect(data.length).toBe(2);
      const hana = data.find((a: any) => a.name === 'Hana');
      const freya = data.find((a: any) => a.name === 'Freya');
      expect(hana).toBeTruthy();
      expect(freya).toBeTruthy();
      expect(hana.published).toBe(true);
      expect(freya.published).toBe(true);
    });

    it('get avatars without JWT (published only)', async () => {
      const { status, body } = await get('/avatars?published=true');
      expect(status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('unauthenticated user gets all published avatars', async () => {
      const { status, body } = await get('/avatars');
      expect(status).toBe(200);
      const data = body.data;
      expect(data.length).toBe(2);
      const hana = data.find((a: any) => a.name === 'Hana');
      expect(hana).toBeTruthy();
      expect(hana.published).toBe(true);
    });

    it('bob cannot delete alice avatar', async () => {
      const { status } = await api('DELETE', `/avatars/${hanaAvatarId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    // ─── Gender filtering ──────────────────────────────────────

    it('alice gets only public female avatars named "hana"', async () => {
      const { status, body } = await api('GET', '/avatars?published=true&gender=Female&name=hana', auth.alice.jwt);
      expect(status).toBe(200);
      const data = body.data;
      expect(data).toHaveLength(1);
      expect(data[0]).toHaveProperty('name', 'Hana');
      expect(data[0]).toHaveProperty('gender', 'Female');
      expect(data[0]).toHaveProperty('published', true);
      expect(data[0]).toHaveProperty('free', true);
      expect(body.meta.total).toBe(1);
    });

    it('alice -> gender=Female (all visible, only female)', async () => {
      const { status, body } = await api('GET', '/avatars?gender=Female', auth.alice.jwt);
      expect(status).toBe(200);
      const data = body.data;
      const names = data.map((a: any) => a.name).sort();
      expect(names).toEqual(['Freya', 'Hana']);
      data.forEach((a: any) => expect(a.gender).toBe('Female'));
      expect(body.meta.total).toBe(2);
    });

    it('alice -> name search is case-insensitive', async () => {
      const { status, body } = await api('GET', '/avatars?name=ha', auth.alice.jwt);
      expect(status).toBe(200);
      const data = body.data;
      expect(data).toHaveLength(1);
      expect(data[0]).toHaveProperty('name', 'Hana');
    });

    it('alice -> mine=true&name=fre (own avatars whose name contains "fre")', async () => {
      const { status, body } = await api('GET', '/avatars?mine=true&name=fre', auth.alice.jwt);
      expect(status).toBe(200);
      const data = body.data;
      expect(data).toHaveLength(1);
      expect(data[0]).toHaveProperty('name', 'Freya');
      expect(data[0]).toHaveProperty('userId', auth.alice.userId);
      expect(body.meta.total).toBe(1);
    });

    it('alice -> published=true&gender=Female&name=ha (compound AND)', async () => {
      const { status, body } = await api('GET', '/avatars?published=true&gender=Female&name=ha', auth.alice.jwt);
      expect(status).toBe(200);
      const data = body.data;
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        name: 'Hana',
        published: true,
        gender: 'Female',
      });
      expect(body.meta.total).toBe(1);
    });

    it('alice -> published=true&gender=Male (expect empty list)', async () => {
      const { status, body } = await api('GET', '/avatars?published=true&gender=Male', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data).toHaveLength(0);
      expect(body.meta.total).toBe(0);
    });

    // ─── Bob filtering ─────────────────────────────────────────

    it('bob -> default /avatars (own + chat) returns only Joi', async () => {
      const { status, body } = await api('GET', '/avatars', auth.bob.jwt);
      expect(status).toBe(200);
      const data = body.data;
      expect(data).toHaveLength(1);
      expect(data[0]).toHaveProperty('name', 'Joi');
      expect(body.meta.total).toBe(1);
    });

    it('bob -> published=true (all public avatars)', async () => {
      const { status, body } = await api('GET', '/avatars?published=true', auth.bob.jwt);
      expect(status).toBe(200);
      const data = body.data;
      const names = data.map((a: any) => a.name).sort();
      expect(names).toEqual(['Freya', 'Hana']);
      data.forEach((a: any) => expect(a.published).toBe(true));
      expect(body.meta.total).toBe(2);
    });

    it('bob -> gender=Female (only female avatars visible to Bob)', async () => {
      const { status, body } = await api('GET', '/avatars?gender=Female', auth.bob.jwt);
      expect(status).toBe(200);
      const data = body.data;
      const names = data.map((a: any) => a.name).sort();
      expect(names).toEqual(['Joi']);
      data.forEach((a: any) => expect(a.gender).toBe('Female'));
      expect(body.meta.total).toBe(1);
    });

    it('bob -> mine=true&name=jo (substring match on own avatars)', async () => {
      const { status, body } = await api('GET', '/avatars?mine=true&name=jo', auth.bob.jwt);
      expect(status).toBe(200);
      const data = body.data;
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        name: 'Joi',
        userId: auth.bob.userId,
      });
      expect(body.meta.total).toBe(1);
    });

    it('bob -> published=true&gender=Female (compound AND)', async () => {
      const { status, body } = await api('GET', '/avatars?published=true&gender=Female', auth.bob.jwt);
      expect(status).toBe(200);
      const data = body.data;
      expect(data).toHaveLength(2);
      expect(body.meta.total).toBe(2);
    });

    it('bob -> published=true&gender=Male (expect empty list)', async () => {
      const { status, body } = await api('GET', '/avatars?published=true&gender=Male', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data).toHaveLength(0);
      expect(body.meta.total).toBe(0);
    });

    // ─── Recommended tests ─────────────────────────────────────

    it('alice (non-admin) cannot set recommended on her hana avatar', async () => {
      const { status } = await api('PATCH', `/avatars/${hanaAvatarId}`, auth.alice.jwt, {
        recommended: true,
      });
      expect(status).toBe(403);
    });

    it('admin can set recommended on hana avatar', async () => {
      const { status, body } = await api('PATCH', `/avatars/${hanaAvatarId}`, auth.admin.jwt, {
        recommended: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('recommended', true);
      expect(body).toHaveProperty('name', 'Hana');
    });

    it('aliceUserProcessEvents contains 2 Events after hana recommended', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 2);
      expect(aliceUserProcessEvents.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    it('filter recommended=true returns only hana', async () => {
      const { status, body } = await api('GET', '/avatars?published=true&recommended=true', auth.alice.jwt);
      expect(status).toBe(200);
      const data = body.data;
      expect(data).toHaveLength(1);
      expect(data[0]).toHaveProperty('name', 'Hana');
      expect(data[0]).toHaveProperty('recommended', true);
      expect(body.meta.total).toBe(1);
    });

    it('recommended avatars appear first in default sort', async () => {
      const { status, body } = await api('GET', '/avatars?published=true', auth.alice.jwt);
      expect(status).toBe(200);
      const data = body.data;
      expect(data).toHaveLength(2);
      // Hana (recommended) should come before Freya (not recommended)
      expect(data[0]).toHaveProperty('name', 'Hana');
      expect(data[0]).toHaveProperty('recommended', true);
      expect(data[1]).toHaveProperty('name', 'Freya');
      expect(data[1]).toHaveProperty('recommended', false);
    });

    it('unauthenticated user can filter by recommended', async () => {
      const { status, body } = await get('/avatars?recommended=true');
      expect(status).toBe(200);
      const data = body.data;
      expect(data).toHaveLength(1);
      expect(data[0]).toHaveProperty('name', 'Hana');
      expect(data[0]).toHaveProperty('recommended', true);
    });

    it('admin can unset recommended on hana avatar', async () => {
      const { status, body } = await api('PATCH', `/avatars/${hanaAvatarId}`, auth.admin.jwt, {
        recommended: false,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('recommended', false);
    });

    it('aliceUserProcessEvents contains 2 Events after hana unrecommended', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 2);
      expect(aliceUserProcessEvents.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    it('filter recommended=true returns empty after unrecommending', async () => {
      const { status, body } = await api('GET', '/avatars?published=true&recommended=true', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data).toHaveLength(0);
      expect(body.meta.total).toBe(0);
    });

    // ─── Publish alice SmallTalk scenario ──────────────────────
    // Needed for further scenario nesting tests

    it('alice can update aliceSmallTalkScenario to published', async () => {
      const { body: scenarios } = await api('GET', '/scenarios?mine=true', auth.alice.jwt);
      const smallTalk = scenarios.data.find((s: any) => !s.nsfw && !s.published);
      if (!smallTalk) return; // already published

      const { status, body } = await api('PATCH', `/scenarios/${smallTalk.id}`, auth.alice.jwt, {
        published: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('published', true);
    });

    it('aliceUserProcessEvents drained after scenario publish', async () => {
      // Scenario update may or may not fire events depending on processor registration
      // Wait briefly and drain
      await new Promise((r) => setTimeout(r, 1000));
      aliceUserProcessEvents = [];
    });

    // ─── Freya scenario update with published scenario ─────────

    it('alice can update her freya avatar with aliceSmallTalkScenario because it is now published', async () => {
      const { body: scenarios } = await api('GET', '/scenarios?mine=true&published=true', auth.alice.jwt);
      const aliceSmallTalk = scenarios.data.find((s: any) => !s.nsfw);
      if (!aliceSmallTalk) return;

      const { status, body } = await api('PATCH', `/avatars/${freyaAvatarId}`, auth.alice.jwt, {
        scenarioIds: [aliceSmallTalk.id],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('published', true);
      expect(body.scenarios).toHaveLength(1);
    });

    it('drain aliceUserProcessEvents after freya scenario update', async () => {
      await new Promise(r => setTimeout(r, 1000));
      aliceUserProcessEvents = [];
    });

    // ─── Both published state ──────────────────────────────────

    it('alice gets all 2 avatars: both published', async () => {
      const { status, body } = await api('GET', '/avatars', auth.alice.jwt);
      expect(status).toBe(200);
      const data = body.data;
      expect(data.length).toBe(2);
      const hana = data.find((a: any) => a.name === 'Hana');
      const freya = data.find((a: any) => a.name === 'Freya');
      expect(freya).toBeTruthy();
      expect(hana).toBeTruthy();
      expect(hana.published).toBe(true);
      expect(freya.published).toBe(true);
    });

    it('alice gets all 2 published avatars', async () => {
      const { status, body } = await api('GET', '/avatars?published=true', auth.alice.jwt);
      expect(status).toBe(200);
      const avatars = body.data;
      expect(avatars.length).toBe(2);
      const hana = avatars.find((a: any) => a.name === 'Hana');
      const freya = avatars.find((a: any) => a.name === 'Freya');
      expect(hana).toBeTruthy();
      expect(freya).toBeTruthy();
      expect(hana.published).toBe(true);
      expect(freya.published).toBe(true);
    });

    it('Bob gets all 2 public avatars', async () => {
      const { status, body } = await api('GET', '/avatars?published=true', auth.bob.jwt);
      expect(status).toBe(200);
      const avatars = body.data;
      expect(avatars.length).toBe(2);
      const hana = avatars.find((a: any) => a.name === 'Hana');
      const freya = avatars.find((a: any) => a.name === 'Freya');
      expect(hana).toBeTruthy();
      expect(freya).toBeTruthy();
      expect(hana.published).toBe(true);
      expect(freya.published).toBe(true);
    });

    // ─── Nested scenario visibility ────────────────────────────
    // Alice creates a private scenario and adds it to her published hana avatar.
    // Bob should not see alice's private scenario when reading hana.

    it('alice creates a private scenario for nested visibility test', async () => {
      const { body: chatModels } = await api('GET', '/chat-models', auth.alice.jwt);
      const chatModel = chatModels.data[0];

      const { body: embeddingModels } = await api('GET', '/embedding-models', auth.alice.jwt);
      const embeddingModel = embeddingModels.data[0];

      const { body: reasoningModels } = await api('GET', '/reasoning-models', auth.alice.jwt);
      const reasoningModel = reasoningModels.data[0];

      const { status, body } = await api('POST', '/scenarios', auth.alice.jwt, {
        name: 'Alice Private Nested',
        systemMessage: 'private scenario for nested visibility test',
        chatModelId: chatModel.id,
        embeddingModelId: embeddingModel.id,
        reasoningModelId: reasoningModel.id,
        temperature: 0.7,
        topP: 0.9,
        frequencyPenalty: 0,
        presencePenalty: 0,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('name', 'Alice Private Nested');
    });

    it('drain aliceUserProcessEvents after private scenario create', async () => {
      await new Promise((r) => setTimeout(r, 1000));
      aliceUserProcessEvents = [];
    });

    it('alice adds private scenario to published hana alongside published scenario', async () => {
      const { body: scenarios } = await api('GET', '/scenarios?published=true&nsfw=true', auth.alice.jwt);
      const publicScenario = scenarios.data[0];

      const { body: privateScenarios } = await api('GET', '/scenarios?name=Alice Private Nested', auth.alice.jwt);
      const privateScenario = privateScenarios.data[0];

      const { status, body } = await api('PATCH', `/avatars/${hanaAvatarId}`, auth.alice.jwt, {
        scenarioIds: [publicScenario.id, privateScenario.id],
      });
      expect(status).toBe(200);
      expect(body.scenarios).toHaveLength(2);
    });

    it('drain aliceUserProcessEvents after hana scenario update', async () => {
      await new Promise(r => setTimeout(r, 1000));
      aliceUserProcessEvents = [];
    });

    it('bob reads published hana and does not see alice private scenario', async () => {
      const { status, body } = await api('GET', `/avatars/${hanaAvatarId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('published', true);
      expect(body.scenarios).toHaveLength(1);
      expect(body.scenarios[0]).toHaveProperty('published', true);
    });

    it('alice reads her own hana and sees both scenarios including her private one', async () => {
      const { status, body } = await api('GET', `/avatars/${hanaAvatarId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.scenarios).toHaveLength(2);
      const names = body.scenarios.map((s: any) => s.name).sort();
      expect(names).toContain('Alice Private Nested');
    });

    it('unauthenticated user reads published hana and does not see private scenario', async () => {
      const { status, body } = await get(`/avatars/${hanaAvatarId}`);
      expect(status).toBe(200);
      expect(body.scenarios).toHaveLength(1);
      expect(body.scenarios[0]).toHaveProperty('published', true);
    });

    // ─── Nested avatar visibility on scenarios ─────────────────
    // bobDeepTalkScenario is public and linked to hana (published, alice) and joi (private, bob).
    // When alice reads bobDeepTalkScenario, she should see hana but not joi.
    // When bob reads bobDeepTalkScenario, he should see both hana and joi (joi is his own).

    it('alice reads public bobDeepTalkScenario and does not see bob private joi avatar', async () => {
      const { body: scenarios } = await api('GET', '/scenarios?published=true&nsfw=true', auth.alice.jwt);
      const bobDeepTalk = scenarios.data[0];

      const { status, body } = await api('GET', `/scenarios/${bobDeepTalk.id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.avatars).toHaveLength(1);
      expect(body.avatars[0]).toHaveProperty('name', 'Hana');
      expect(body.avatars[0]).toHaveProperty('published', true);
    });

    it('bob reads public bobDeepTalkScenario and sees both hana and his own private joi', async () => {
      const { body: scenarios } = await api('GET', '/scenarios?published=true&nsfw=true', auth.bob.jwt);
      const bobDeepTalk = scenarios.data[0];

      const { status, body } = await api('GET', `/scenarios/${bobDeepTalk.id}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.avatars).toHaveLength(2);
      const names = body.avatars.map((a: any) => a.name).sort();
      expect(names).toEqual(['Hana', 'Joi']);
    });

    it('unauthenticated user reads public bobDeepTalkScenario and only sees published avatars', async () => {
      const { body: scenarios } = await api('GET', '/scenarios?published=true&nsfw=true', auth.alice.jwt);
      const bobDeepTalk = scenarios.data[0];

      const { status, body } = await get(`/scenarios/${bobDeepTalk.id}`);
      expect(status).toBe(200);
      expect(body.avatars).toHaveLength(1);
      expect(body.avatars[0]).toHaveProperty('published', true);
    });

    // ─── Revert hana to only published scenario ────────────────

    it('alice reverts hana to only published scenario', async () => {
      const { body: scenarios } = await api('GET', '/scenarios?published=true&nsfw=true', auth.alice.jwt);
      const publicScenario = scenarios.data[0];

      const { status, body } = await api('PATCH', `/avatars/${hanaAvatarId}`, auth.alice.jwt, {
        scenarioIds: [publicScenario.id],
      });
      expect(status).toBe(200);
      expect(body.scenarios).toHaveLength(1);
    });

    it('drain aliceUserProcessEvents after hana revert', async () => {
      await new Promise(r => setTimeout(r, 1000));
      aliceUserProcessEvents = [];
    });

    // ─── Get avatar by id has ttsVoice ─────────────────────────

    it('get avatar by id has ttsVoice', async () => {
      const { status, body } = await get(`/avatars/${hanaAvatarId}`);
      expect(status).toBe(200);
      expect(body).toHaveProperty('name', 'Hana');
      expect(body.ttsVoice).toBeDefined();
    });

    // ─── Admin recommends hana avatar (final state) ────────────

    it('admin recommends hana avatar', async () => {
      const { status, body } = await api('PATCH', `/avatars/${hanaAvatarId}`, auth.admin.jwt, {
        recommended: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('recommended', true);
    });

    it('aliceUserProcessEvents contains 2 Events after final recommend', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 2);
      expect(aliceUserProcessEvents.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    // ─── Cascade delete ─────────────────────────────────────────

    it('deleting an avatar cascades to its chats', async () => {
      // Create a temporary avatar + chat
      const { body: ttsVoices } = await api('GET', '/tts-voices', auth.alice.jwt);
      const { body: tempAvatar } = await api('POST', '/avatars', auth.alice.jwt, {
        name: 'TempCascade', shortDesc: 'test', character: 'test',
        ttsVoiceId: ttsVoices.data[0].id,
      });
      const { body: scenarios } = await api('GET', '/scenarios?published=true', auth.alice.jwt);
      const { body: tempChat } = await api('POST', '/chats', auth.alice.jwt, {
        avatarId: tempAvatar.id, scenarioId: scenarios.data[0].id, tts: false,
      });
      const chatId = tempChat.id;

      // Delete the avatar
      const { status } = await api('DELETE', `/avatars/${tempAvatar.id}`, auth.alice.jwt);
      expect(status).toBe(200);

      // Chat should be gone
      const { status: chatStatus } = await api('GET', `/chats/${chatId}`, auth.alice.jwt);
      expect(chatStatus).toBe(404);
    });

    it('drain events after cascade delete test', async () => {
      await new Promise((r) => setTimeout(r, 2000));
      aliceUserProcessEvents = [];
    });

    // ─── MQTT cleanup ──────────────────────────────────────────

    it('no unprocessed events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      if (aliceUserProcessEvents.length > 0) console.log('Unprocessed alice user events:', aliceUserProcessEvents.length, aliceUserProcessEvents);
      if (bobUserProcessEvents.length > 0) console.log('Unprocessed bob user events:', bobUserProcessEvents.length, bobUserProcessEvents);
      expect(aliceUserProcessEvents.length).toBe(0);
      expect(bobUserProcessEvents.length).toBe(0);
    });

    it('disconnect alice MQTT client', () => {
      aliceMqttClient.end();
    });

    it('disconnect bob MQTT client', () => {
      bobMqttClient.end();
    });
  });
}
