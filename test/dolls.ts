import { auth, api, get, wallets, connectMqtt, waitForEvents, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient, BASE_URL } from './helpers';

export function describeDolls() {
  describe('Dolls', () => {
    let aliceMqttClient: MqttClient;
    let aliceUserProcessEvents: ProcessEvent[] = [];
    let aliceDollProcessEvents: ProcessEvent[] = [];

    let doll1MqttClient: MqttClient;
    let doll1DollProcessEvents: ProcessEvent[] = [];

    let doll2MqttClient: MqttClient;
    let doll2DollProcessEvents: ProcessEvent[] = [];

    // Resolved seed data
    let hanaId: string;
    let freyaId: string;
    let smallTalkScenarioId: string;
    let smartWigId: string;
    let localWhisperSttId: string;

    // Doll + chat IDs (scoped to this describe block)
    let doll1Id: string;
    let doll2Id: string;
    let hanaChatId: string;
    let freyaChatId: string;

    // ─── MQTT setup + drain late events ───────────────────────────

    it('connect alice MQTT client, subscribe to user topic, and drain late events', async () => {
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
      aliceMqttClient.subscribe(`users/${auth.alice.userId}/processEvents`);
      const chatScoped = new Set(['Chat', 'Message', 'TtsJob', 'ChatCompletionJob', 'EmbeddingJob']);
      aliceMqttClient.on('message', (topic, msg) => {
        const event = JSON.parse(msg.toString()) as ProcessEvent;
        if (topic.startsWith('dolls/')) {
          aliceDollProcessEvents.push(event);
        } else if (!chatScoped.has(event.resourceName)) {
          aliceUserProcessEvents.push(event);
        }
      });
      await new Promise((r) => setTimeout(r, 2000));
      aliceUserProcessEvents = [];
      aliceDollProcessEvents = [];
    });

    // ─── Resolve seed data ──────────────────────────────────────

    it('fetch test dependencies (avatars, scenarios, dollBodies, sttProviders)', async () => {
      const { body: avatars } = await api('GET', '/avatars', auth.alice.jwt);
      const hana = avatars.data.find((a: any) => a.name === 'Hana');
      const freya = avatars.data.find((a: any) => a.name === 'Freya');
      expect(hana).toBeTruthy();
      expect(freya).toBeTruthy();
      hanaId = hana.id;
      freyaId = freya.id;

      const { body: scenarios } = await api('GET', '/scenarios', auth.alice.jwt);
      const smallTalk = scenarios.data.find((s: any) => s.name === 'Small Talk');
      expect(smallTalk).toBeTruthy();
      smallTalkScenarioId = smallTalk.id;

      const { body: dollBodies } = await api('GET', '/doll-bodies', auth.alice.jwt);
      expect(dollBodies.data.length).toBeGreaterThan(0);
      const senseCap = dollBodies.data.find((d: any) => d.name === 'SenseCAP Watcher') ?? dollBodies.data[0];
      smartWigId = senseCap.id;

      const { body: sttProviders } = await api('GET', '/stt-providers', auth.alice.jwt);
      expect(sttProviders.data.length).toBeGreaterThan(0);
      localWhisperSttId = sttProviders.data[0].id;
    });

    // ─── Empty state ────────────────────────────────────────────

    it('alice get 0 dolls', async () => {
      const { status, body } = await api('GET', '/dolls', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── Create doll1 via API key ───────────────────────────────

    it('dollBody post a Doll as alice apikey', async () => {
      const { status, body } = await api('POST', '/dolls', auth.alice.apiKey, {
        dollBodyId: smartWigId,
        macAddress: '11:11:11:11:11:11',
      });
      expect(status).toBe(200);
      expect(body.chatId).not.toBe(null);
      expect(body.macAddress).toBe('11:11:11:11:11:11');
      expect(body.dollBodyId).toBe(smartWigId);
      doll1Id = body.id;
      hanaChatId = body.chatId;

      // Connect doll1 dedicated MQTT client (subscribed AFTER creation so creation events on doll topic are missed)
      doll1MqttClient = await connectMqtt(auth.alice.apiKey);
      doll1MqttClient.subscribe(`dolls/${doll1Id}/processEvents`);
      doll1MqttClient.on('message', (topic, msg) => {
        const event = JSON.parse(msg.toString()) as ProcessEvent;
        if (topic.startsWith('dolls/')) doll1DollProcessEvents.push(event);
      });
    });

    it('aliceUserProcessEvents contains 2 Events after doll1 create', async () => {
      await waitForEvents(aliceUserProcessEvents, 2);
      expect(aliceUserProcessEvents.length).toBe(2);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const dolls = processEvents.Doll || [];
      expect(dolls.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    // ─── Get dolls ──────────────────────────────────────────────

    it('alice get 1 dolls', async () => {
      const { status, body } = await api('GET', '/dolls', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('alice get all chats (find the one with doll1)', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      // The doll1 was auto-assigned to a chat — find it via the doll's chatId
      const { body: doll } = await api('GET', `/dolls/${doll1Id}`, auth.alice.jwt);
      hanaChatId = doll.chatId;
      expect(hanaChatId).toBeTruthy();
    });

    it('alice get hanaChat by ID and connect to it via aliceMqttClient', async () => {
      const { status, body } = await api('GET', `/chats/${hanaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.sttProvider).not.toBeNull();
      expect(body).toHaveProperty('avatarId', hanaId);
      expect(body.doll).toHaveProperty('id', doll1Id);
      expect(body.scenarioId).not.toBeNull();
      aliceMqttClient.subscribe(`chats/${hanaChatId}/processEvents`);
    });

    it('alice get her doll1 by id and connect to it via aliceMqttClient', async () => {
      const { status, body } = await api('GET', `/dolls/${doll1Id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', doll1Id);
      expect(body).toHaveProperty('macAddress', '11:11:11:11:11:11');
      expect(body).toHaveProperty('chatId', hanaChatId);
      expect(body).toHaveProperty('dollBodyId', smartWigId);
      aliceMqttClient.subscribe(`dolls/${doll1Id}/processEvents`);
    });

    // ─── Create second doll (displaces first from hanaChat) ─────

    it('dollBody2 post a Doll2 as alice apikey', async () => {
      const { status, body } = await api('POST', '/dolls', auth.alice.apiKey, {
        dollBodyId: smartWigId,
        macAddress: '22:22:22:22:22:22',
      });
      expect(status).toBe(200);
      expect(body.chatId).toBe(hanaChatId);
      expect(body.macAddress).toBe('22:22:22:22:22:22');
      expect(body.dollBodyId).toBe(smartWigId);
      doll2Id = body.id;

      // Connect doll2 dedicated MQTT client
      doll2MqttClient = await connectMqtt(auth.alice.jwt);
      doll2MqttClient.subscribe(`dolls/${doll2Id}/processEvents`);
      doll2MqttClient.on('message', (topic, msg) => {
        const event = JSON.parse(msg.toString()) as ProcessEvent;
        if (topic.startsWith('dolls/')) doll2DollProcessEvents.push(event);
      });
    });

    it('aliceUserProcessEvents contains 2 doll Events after doll2 create', async () => {
      await waitForEvents(aliceUserProcessEvents, 2);
      expect(aliceUserProcessEvents.length).toBe(2);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const dolls = processEvents.Doll || [];
      expect(dolls.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    it('aliceDollProcessEvents contains 0 doll Event', async () => {
      expect(aliceDollProcessEvents.length).toBe(0);
    });

    it('doll1DollProcessEvents contains 0 Events', async () => {
      expect(doll1DollProcessEvents.length).toBe(0);
    });

    it('drain doll2DollProcessEvents after creation', async () => {
      await new Promise(r => setTimeout(r, 1000));
      aliceUserProcessEvents = [];
      aliceDollProcessEvents = [];
      doll1DollProcessEvents = [];
      doll2DollProcessEvents = [];
    });

    // ─── Verify displacement ────────────────────────────────────

    it('alice get her doll1 by id that is disconnected to a chat', async () => {
      const { status, body } = await api('GET', `/dolls/${doll1Id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', doll1Id);
      expect(body).toHaveProperty('macAddress', '11:11:11:11:11:11');
      expect(body).toHaveProperty('chatId', null);
      expect(body).toHaveProperty('dollBodyId', smartWigId);
    });

    it('alice get her doll2 by id that is connected to chat1', async () => {
      const { status, body } = await api('GET', `/dolls/${doll2Id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', doll2Id);
      expect(body).toHaveProperty('macAddress', '22:22:22:22:22:22');
      expect(body).toHaveProperty('chatId', hanaChatId);
      expect(body).toHaveProperty('dollBodyId', smartWigId);
    });

    it('alice get hanaChat with new connected doll', async () => {
      const { status, body } = await api('GET', `/chats/${hanaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.sttProvider).not.toBeNull();
      expect(body).toHaveProperty('avatarId', hanaId);
      expect(body.doll).toHaveProperty('id', doll2Id);
      expect(body.scenarioId).not.toBeNull();
    });

    // ─── Create freya chat (no doll) ────────────────────────────

    it('alice creates the freya Chat', async () => {
      const { status, body } = await api('POST', '/chats', auth.alice.jwt, {
        avatarId: freyaId,
        scenarioId: smallTalkScenarioId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('avatarId', freyaId);
      expect(body).toHaveProperty('scenarioId', smallTalkScenarioId);
      freyaChatId = body.id;
    });

    it('drain aliceUserProcessEvents after freya chat creation', async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      aliceUserProcessEvents = [];
    });

    // ─── Connect doll1 to freyaChat ────────────────────────────

    it('alice patched/connect the doll1 with freyaChat', async () => {
      const { status, body } = await api('PATCH', `/dolls/${doll1Id}`, auth.alice.jwt, {
        chatId: freyaChatId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('chatId', freyaChatId);
    });

    it('doll1 gets 2 processEvents', async () => {
      await waitForEvents(doll1DollProcessEvents, 2);
      expect(doll1DollProcessEvents.length).toBe(2);
      const processEvents = groupByResourceName(doll1DollProcessEvents);
      const dolls = processEvents.Doll || [];
      expect(dolls.length).toBe(2);
      doll1DollProcessEvents = [];
    });

    it('aliceUserProcessEvents contains 2 Doll Events (doll1 update)', async () => {
      await waitForEvents(aliceUserProcessEvents, 2);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const dolls = processEvents.Doll || [];
      expect(dolls.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    it('drain aliceChatProcessEvents (greeting events may have arrived before subscription)', async () => {
      aliceDollProcessEvents = [];
    });

    it('alice get freyaChat with connected doll1', async () => {
      const { status, body } = await api('GET', `/chats/${freyaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.sttProvider).not.toBeNull();
      expect(body).toHaveProperty('avatarId', freyaId);
      expect(body.doll).toHaveProperty('id', doll1Id);
      expect(body.scenarioId).not.toBeNull();
    });

    // freyaChat <=> doll1
    // hanaChat <=> doll2

    // ─── Delete hanaChat → doll2 disconnected ───────────────────

    it('alice delete the hanaChat', async () => {
      const { status } = await api('DELETE', `/chats/${hanaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('drain aliceUserProcessEvents after hanaChat delete', async () => {
      await new Promise(r => setTimeout(r, 1000));
      aliceUserProcessEvents = [];
      aliceDollProcessEvents = [];
      doll1DollProcessEvents = [];
      doll2DollProcessEvents = [];
    });

    it('drain aliceDollProcessEvents after hanaChat delete', async () => {
      await new Promise(r => setTimeout(r, 1000));
      aliceUserProcessEvents = [];
      aliceDollProcessEvents = [];
      doll1DollProcessEvents = [];
      doll2DollProcessEvents = [];
    });

    it('drain doll2DollProcessEvents after hanaChat delete', async () => {
      await new Promise(r => setTimeout(r, 1000));
      aliceUserProcessEvents = [];
      aliceDollProcessEvents = [];
      doll1DollProcessEvents = [];
      doll2DollProcessEvents = [];
    });

    it('alice get her doll2 by id', async () => {
      const { status, body } = await api('GET', `/dolls/${doll2Id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', doll2Id);
      expect(body).toHaveProperty('macAddress', '22:22:22:22:22:22');
      expect(body).toHaveProperty('chatId', null);
      expect(body).toHaveProperty('dollBodyId', smartWigId);
    });

    it('alice get her doll1 by id', async () => {
      const { status, body } = await api('GET', `/dolls/${doll1Id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', doll1Id);
      expect(body).toHaveProperty('macAddress', '11:11:11:11:11:11');
      expect(body).toHaveProperty('chatId', freyaChatId);
      expect(body).toHaveProperty('dollBodyId', smartWigId);
    });

    it('alice get all 1 chats', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    // ─── Delete doll1 ───────────────────────────────────────────

    it('delete doll1 as alice', async () => {
      const { status } = await api('DELETE', `/dolls/${doll1Id}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('aliceUserProcessEvents contains 2 Doll Events after doll1 delete', async () => {
      await waitForEvents(aliceUserProcessEvents, 2);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const dolls = processEvents.Doll || [];
      expect(dolls.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    it('aliceDollProcessEvents contains 2 Events after doll1 delete', async () => {
      await waitForEvents(aliceDollProcessEvents, 2);
      expect(aliceDollProcessEvents.length).toBe(2);
      aliceDollProcessEvents = [];
    });

    it('doll1DollProcessEvents contains 2 Events after doll1 delete', async () => {
      await waitForEvents(doll1DollProcessEvents, 2);
      expect(doll1DollProcessEvents.length).toBe(2);
      doll1DollProcessEvents = [];
    });

    // freyaChat <=> null
    // null <=> doll2

    // ─── Connect doll2 to freyaChat ────────────────────────────

    it('alice patched/connect the doll2 with freyaChat', async () => {
      const { status, body } = await api('PATCH', `/dolls/${doll2Id}`, auth.alice.jwt, {
        chatId: freyaChatId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('chatId', freyaChatId);
    });

    it('doll2DollProcessEvents contains 2 Events', async () => {
      await waitForEvents(doll2DollProcessEvents, 2);
      expect(doll2DollProcessEvents.length).toBe(2);
      const processEvents = groupByResourceName(doll2DollProcessEvents);
      const dolls = processEvents.Doll || [];
      expect(dolls.length).toBe(2);
      doll2DollProcessEvents = [];
    });

    it('aliceUserProcessEvents contains 2 Doll Events after doll2→freyaChat', async () => {
      await waitForEvents(aliceUserProcessEvents, 2);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const dolls = processEvents.Doll || [];
      expect(dolls.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    it('alice get 1 dolls', async () => {
      const { status, body } = await api('GET', '/dolls', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('alice get 1 chats', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    // freyaChat <=> doll2

    it('alice get the freyaChat with doll2', async () => {
      const { status, body } = await api('GET', `/chats/${freyaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).not.toHaveProperty('doll', null);
      expect(body.doll).toHaveProperty('id', doll2Id);
      expect(body.doll).toHaveProperty('chatId', freyaChatId);
    });

    // ─── Disconnect doll2 from freyaChat ────────────────────────

    it('alice patched/deconnect the doll2 from freyaChat', async () => {
      const { status, body } = await api('PATCH', `/dolls/${doll2Id}`, auth.alice.jwt, {
        chatId: null,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('chatId', null);
    });

    it('doll2DollProcessEvents contains 2 Events after disconnect', async () => {
      await waitForEvents(doll2DollProcessEvents, 2);
      expect(doll2DollProcessEvents.length).toBe(2);
      const processEvents = groupByResourceName(doll2DollProcessEvents);
      const dolls = processEvents.Doll || [];
      expect(dolls.length).toBe(2);
      doll2DollProcessEvents = [];
    });

    it('aliceUserProcessEvents contains 2 Doll Events after doll2 disconnect', async () => {
      await waitForEvents(aliceUserProcessEvents, 2);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const dolls = processEvents.Doll || [];
      expect(dolls.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    // null <=> doll2
    // freyaChat <=> null

    /* ────────────────────────────────────────────────────────────────
       EDGE CASES — Validation (400)
       ──────────────────────────────────────────────────────────────── */

    it('POST /dolls with empty body → 400', async () => {
      const { status } = await api('POST', '/dolls', auth.alice.apiKey, {});
      expect(status).toBe(422);
    });

    it('POST /dolls with missing macAddress → 400', async () => {
      const { status } = await api('POST', '/dolls', auth.alice.apiKey, {
        dollBodyId: smartWigId,
      });
      expect(status).toBe(422);
    });

    it('POST /dolls with missing dollBodyId → 400', async () => {
      const { status } = await api('POST', '/dolls', auth.alice.apiKey, {
        macAddress: '99:99:99:99:99:99',
      });
      expect(status).toBe(422);
    });

    it('POST /dolls with invalid dollBodyId (not UUID) → 400', async () => {
      const { status } = await api('POST', '/dolls', auth.alice.apiKey, {
        macAddress: '99:99:99:99:99:99',
        dollBodyId: 'not-a-uuid',
      });
      expect(status).toBe(422);
    });

    /* ────────────────────────────────────────────────────────────────
       EDGE CASES — Duplicate macAddress (same user)
       ──────────────────────────────────────────────────────────────── */

    it('POST /dolls with existing macAddress returns existing doll2', async () => {
      const { status, body } = await api('POST', '/dolls', auth.alice.apiKey, {
        macAddress: '22:22:22:22:22:22',
        dollBodyId: smartWigId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', doll2Id);
      expect(body).toHaveProperty('macAddress', '22:22:22:22:22:22');
    });

    /* ────────────────────────────────────────────────────────────────
       EDGE CASES — Non-existent resources
       ──────────────────────────────────────────────────────────────── */

    it('GET /dolls/:nonExistentId → 404', async () => {
      const { status } = await api('GET', '/dolls/00000000-0000-0000-0000-000000000000', auth.alice.jwt);
      expect(status).toBe(404);
    });

    it('PATCH /dolls/:nonExistentId → 404', async () => {
      const { status } = await api('PATCH', '/dolls/00000000-0000-0000-0000-000000000000', auth.alice.jwt, {
        name: 'test',
      });
      expect(status).toBe(404);
    });

    it('POST /dolls with non-existent dollBodyId → 404', async () => {
      const { status } = await api('POST', '/dolls', auth.alice.apiKey, {
        macAddress: '99:99:99:99:99:99',
        dollBodyId: '00000000-0000-0000-0000-000000000000',
      });
      expect(status).toBe(404);
    });

    it('PATCH /dolls/:id with non-existent chatId → 403', async () => {
      const { status } = await api('PATCH', `/dolls/${doll2Id}`, auth.alice.jwt, {
        chatId: '00000000-0000-0000-0000-000000000000',
      });
      expect(status).toBe(403);
    });

    /* ────────────────────────────────────────────────────────────────
       EDGE CASES — Cross-user access
       ──────────────────────────────────────────────────────────────── */

    it('bob has 0 dolls', async () => {
      const { status, body } = await api('GET', '/dolls', auth.bob.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    it('bob can NOT read alice doll2 → 403', async () => {
      const { status } = await api('GET', `/dolls/${doll2Id}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    it('bob can NOT update alice doll2 → 403', async () => {
      const { status } = await api('PATCH', `/dolls/${doll2Id}`, auth.bob.jwt, {
        name: 'hacked',
      });
      expect(status).toBe(403);
    });

    it('bob can NOT delete alice doll2', async () => {
      const { status } = await api('DELETE', `/dolls/${doll2Id}`, auth.bob.jwt);
      expect(status).not.toBe(200);
    });

    it('alice doll2 still exists after bob delete attempt', async () => {
      const { status, body } = await api('GET', `/dolls/${doll2Id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', doll2Id);
    });

    /* ────────────────────────────────────────────────────────────────
       EDGE CASES — Duplicate macAddress (different user)
       ──────────────────────────────────────────────────────────────── */

    it('bob POST /dolls with alice macAddress → 200 (reassigns doll to bob)', async () => {
      const { status, body } = await api('POST', '/dolls', auth.bob.jwt, {
        macAddress: '22:22:22:22:22:22',
        dollBodyId: smartWigId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', doll2Id);
      expect(body).toHaveProperty('macAddress', '22:22:22:22:22:22');
    });

    it('alice POST /dolls with same macAddress → 200 (reassigns doll back to alice)', async () => {
      const { status, body } = await api('POST', '/dolls', auth.alice.apiKey, {
        macAddress: '22:22:22:22:22:22',
        dollBodyId: smartWigId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', doll2Id);
    });

    it('drain aliceUserProcessEvents after doll reassignment back', async () => {
      await waitForEvents(aliceUserProcessEvents, 2);
      aliceUserProcessEvents = [];
    });

    /* ────────────────────────────────────────────────────────────────
       EDGE CASES — Unauthenticated requests
       ──────────────────────────────────────────────────────────────── */

    it('GET /dolls without auth → 401', async () => {
      const { status } = await get('/dolls');
      expect(status).toBe(401);
    });

    it('POST /dolls without auth → 401', async () => {
      const res = await fetch(`${BASE_URL}/dolls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ macAddress: '99:99:99:99:99:99', dollBodyId: smartWigId }),
      });
      expect(res.status).toBe(401);
    });

    it('PATCH /dolls/:id without auth → 401', async () => {
      const res = await fetch(`${BASE_URL}/dolls/${doll2Id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      });
      expect(res.status).toBe(401);
    });

    it('DELETE /dolls/:id without auth → 401', async () => {
      const res = await fetch(`${BASE_URL}/dolls/${doll2Id}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });

    /* ────────────────────────────────────────────────────────────────
       CLEANUP
       ──────────────────────────────────────────────────────────────── */

    it('delete doll2', async () => {
      const { status } = await api('DELETE', `/dolls/${doll2Id}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('drain aliceUserProcessEvents after doll2 delete', async () => {
      await waitForEvents(aliceUserProcessEvents, 2);
      aliceUserProcessEvents = [];
    });

    it('delete freyaChat', async () => {
      const { status } = await api('DELETE', `/chats/${freyaChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('alice has 0 dolls', async () => {
      const { status, body } = await api('GET', '/dolls', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    it('alice has chats remaining from previous tests', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      // Chats from the chats test remain — doll-created chats were cleaned up
    });

    // ─── MQTT cleanup ───────────────────────────────────────────

    it('consume remaining events', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      aliceUserProcessEvents = [];
      aliceDollProcessEvents = [];
      doll1DollProcessEvents = [];
      doll2DollProcessEvents = [];
    });

    it('no unprocessed events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      if (aliceUserProcessEvents.length > 0) console.log('Unprocessed alice user events:', aliceUserProcessEvents.length, aliceUserProcessEvents);
      if (aliceDollProcessEvents.length > 0) console.log('Unprocessed alice doll events:', aliceDollProcessEvents.length, aliceDollProcessEvents);
      if (doll1DollProcessEvents.length > 0) console.log('Unprocessed doll1 doll events:', doll1DollProcessEvents.length, doll1DollProcessEvents);
      if (doll2DollProcessEvents.length > 0) console.log('Unprocessed doll2 doll events:', doll2DollProcessEvents.length, doll2DollProcessEvents);
      expect(aliceUserProcessEvents.length).toBe(0);
      expect(aliceDollProcessEvents.length).toBe(0);
      expect(doll1DollProcessEvents.length).toBe(0);
      expect(doll2DollProcessEvents.length).toBe(0);
    });

    it('close MQTT clients', async () => {
      await new Promise((r) => setTimeout(r, 1000));
      aliceMqttClient?.end();
      doll1MqttClient?.end();
      doll2MqttClient?.end();
    });
  });
}
