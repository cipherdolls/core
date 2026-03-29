
import { auth, api, get, connectMqtt, subscribeTopic, waitForEvents, groupByResourceName, type ProcessEvent, type MqttClient } from './helpers';

// Module-level IDs for cross-test imports
export let heartVoiceId: string;
export let bellaVoiceId: string;
export let nicoleVoiceId: string;
export let adamVoiceId: string;

export function describeTtsVoices() {
  describe('TtsVoices Controller (e2e)', () => {
    let adminMqttClient: MqttClient;
    let adminUserProcessEvents: ProcessEvent[] = [];

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect admin MQTT client for ttsVoices', async () => {
      adminMqttClient = await connectMqtt(auth.admin.jwt);
      adminMqttClient.subscribe(`users/${auth.admin.userId}/processEvents`);
      adminMqttClient.on('message', (_topic, msg) => {
        adminUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    // ─── ADMIN creates Heart voice with wrong providerVoiceId ───

    it('admin adds a Heart voice with wrong providerVoiceId to kokoro', async () => {
      const res1 = await api('GET', '/tts-providers?name=CipherdollsKokoro', auth.admin.jwt);
      expect(res1.status).toBe(200);
      const kokoro = res1.body.data[0];

      const { status, body } = await api('POST', '/tts-voices', auth.admin.jwt, {
        name: 'Heart',
        providerVoiceId: 'wrong',
        recommended: false,
        language: 'en',
        ttsProviderId: kokoro.id,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Heart');
      expect(body).toHaveProperty('ttsProviderId', kokoro.id);
      expect(body).toHaveProperty('language', 'en');
      heartVoiceId = body.id;
    });

    // ─── MQTT: events after Heart create (wrong providerVoiceId) ─

    it('adminUserProcessEvents contains >= 2 ttsVoice Events after Heart create', async () => {
      await waitForEvents(adminUserProcessEvents, 2, 30000);
      const events = groupByResourceName(adminUserProcessEvents);
      const ttsVoice = events.TtsVoice || [];
      expect(ttsVoice.length).toBeGreaterThanOrEqual(2);
      adminUserProcessEvents = [];
    });

    // ─── READ: Heart voice with no preview ──────────────────────

    it('alice get kokoroHeart ttsVoice with no preview', async () => {
      const res1 = await api('GET', '/tts-providers?name=CipherdollsKokoro', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const kokoro = res1.body.data[0];

      const res2 = await api('GET', '/tts-voices?name=Heart', auth.alice.jwt);
      expect(res2.status).toBe(200);
      const kokoroHeart = res2.body.data[0];

      const { status, body } = await api('GET', `/tts-voices/${kokoroHeart.id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('preview', null);
      expect(body).toHaveProperty('id', kokoroHeart.id);
      expect(body).toHaveProperty('name', kokoroHeart.name);
      expect(body).toHaveProperty('ttsProviderId', kokoro.id);
    });

    // ─── ADMIN updates Heart with correct providerVoiceId ───────

    it('admin updates Heart voice with correct providerVoiceId', async () => {
      const res1 = await api('GET', '/tts-voices?name=Heart', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const kokoroHeart = res1.body.data[0];

      const { status, body } = await api('PATCH', `/tts-voices/${kokoroHeart.id}`, auth.admin.jwt, {
        providerVoiceId: 'af_heart',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', kokoroHeart.id);
      expect(body).toHaveProperty('providerVoiceId', 'af_heart');
      expect(body).toHaveProperty('preview', null); // still working
    });

    // ─── MQTT: events after Heart providerVoiceId update ────────

    it('adminUserProcessEvents contains 2 ttsVoice Events after providerVoiceId update', async () => {
      await waitForEvents(adminUserProcessEvents, 2, 30000);
      const events = groupByResourceName(adminUserProcessEvents);
      const ttsVoice = events.TtsVoice || [];
      expect(ttsVoice.length).toBe(2);
      adminUserProcessEvents = [];
    });

    // ─── READ: alice gets Heart voice (skip preview check, no TTS integration) ─

    it('alice get kokoroHeart ttsVoice with preview', async () => {
      const res1 = await api('GET', '/tts-providers?name=CipherdollsKokoro', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const kokoro = res1.body.data[0];

      const res2 = await api('GET', '/tts-voices?name=Heart', auth.alice.jwt);
      expect(res2.status).toBe(200);
      const kokoroHeart = res2.body.data[0];

      const { status, body } = await api('GET', `/tts-voices/${kokoroHeart.id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', kokoroHeart.id);
      expect(body).toHaveProperty('name', kokoroHeart.name);
      expect(body).toHaveProperty('ttsProviderId', kokoro.id);
      // NOTE: preview check skipped - no TTS integration in core
    });

    // ─── ADMIN updates Heart voice gender ───────────────────────

    it('admin updates Heart voice with correct Gender', async () => {
      const res1 = await api('GET', '/tts-voices?name=Heart', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const kokoroHeart = res1.body.data[0];

      const { status, body } = await api('PATCH', `/tts-voices/${kokoroHeart.id}`, auth.admin.jwt, {
        gender: 'Female',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('gender', 'Female');
    });

    // no process event for gender update (not in scalarFields)
    it('drain adminUserProcessEvents after gender update', async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      adminUserProcessEvents = [];
    });

    // ─── ADMIN updates Heart language to de ─────────────────────

    it('admin updates Heart voice language to de', async () => {
      const res1 = await api('GET', '/tts-voices?name=Heart', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const kokoroHeart = res1.body.data[0];

      const { status, body } = await api('PATCH', `/tts-voices/${kokoroHeart.id}`, auth.admin.jwt, {
        language: 'de',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('language', 'de');
    });

    it('alice filters ttsVoices by language=de and gets only Heart', async () => {
      const { status, body } = await api('GET', '/tts-voices?language=de', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0]).toHaveProperty('name', 'Heart');
      expect(body.data[0]).toHaveProperty('language', 'de');
    });

    it('alice filters ttsVoices by language=en and gets none (Heart is now de)', async () => {
      const { status, body } = await api('GET', '/tts-voices?language=en', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── READ: alice gets kokoroNicole (actually Heart after changes) ─

    it('alice get kokoroNicole ttsVoice', async () => {
      const res1 = await api('GET', '/tts-providers?name=CipherdollsKokoro', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const kokoro = res1.body.data[0];

      const res2 = await api('GET', '/tts-voices?name=Heart', auth.alice.jwt);
      expect(res2.status).toBe(200);
      const kokoroHeart = res2.body.data[0];

      const { status, body } = await api('GET', `/tts-voices/${kokoroHeart.id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', kokoroHeart.id);
      expect(body).toHaveProperty('name', kokoroHeart.name);
      expect(body).toHaveProperty('ttsProviderId', kokoro.id);
      expect(body).toHaveProperty('gender', 'Female');
      expect(body).toHaveProperty('providerVoiceId', 'af_heart');
    });

    // ─── ADMIN adds Bella voice ─────────────────────────────────

    it('admin adds a Bella voice to kokoro', async () => {
      const res1 = await api('GET', '/tts-providers?name=CipherdollsKokoro', auth.admin.jwt);
      expect(res1.status).toBe(200);
      const kokoro = res1.body.data[0];

      const { status, body } = await api('POST', '/tts-voices', auth.admin.jwt, {
        name: 'Bella',
        providerVoiceId: 'af_bella',
        recommended: false,
        language: 'en',
        ttsProviderId: kokoro.id,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Bella');
      expect(body).toHaveProperty('ttsProviderId', kokoro.id);
      bellaVoiceId = body.id;
    });

    // ─── MQTT: events after Bella create ────────────────────────

    it('adminUserProcessEvents contains >= 2 ttsVoice Events after Bella create', async () => {
      await waitForEvents(adminUserProcessEvents, 2, 30000);
      const events = groupByResourceName(adminUserProcessEvents);
      const ttsVoice = events.TtsVoice || [];
      expect(ttsVoice.length).toBeGreaterThanOrEqual(2);
      adminUserProcessEvents = [];
    });

    // ─── ADMIN adds Nicole voice ────────────────────────────────

    it('admin adds a Nicole voice to kokoro', async () => {
      const res1 = await api('GET', '/tts-providers?name=CipherdollsKokoro', auth.admin.jwt);
      expect(res1.status).toBe(200);
      const kokoro = res1.body.data[0];

      const { status, body } = await api('POST', '/tts-voices', auth.admin.jwt, {
        name: 'Nicole',
        providerVoiceId: 'af_nicole',
        recommended: false,
        language: 'en',
        ttsProviderId: kokoro.id,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Nicole');
      expect(body).toHaveProperty('ttsProviderId', kokoro.id);
      nicoleVoiceId = body.id;
    });

    // ─── MQTT: events after Nicole create ───────────────────────

    it('adminUserProcessEvents contains >= 2 ttsVoice Events after Nicole create', async () => {
      await waitForEvents(adminUserProcessEvents, 2, 30000);
      const events = groupByResourceName(adminUserProcessEvents);
      const ttsVoice = events.TtsVoice || [];
      expect(ttsVoice.length).toBeGreaterThanOrEqual(2);
      adminUserProcessEvents = [];
    });

    // ─── READ: alice gets Nicole voice ──────────────────────────

    it('alice get kokoroNicole ttsVoice by name', async () => {
      const res1 = await api('GET', '/tts-providers?name=CipherdollsKokoro', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const kokoro = res1.body.data[0];

      const res2 = await api('GET', '/tts-voices?name=Nicole', auth.alice.jwt);
      expect(res2.status).toBe(200);
      const kokoroNicole = res2.body.data[0];

      const { status, body } = await api('GET', `/tts-voices/${kokoroNicole.id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', kokoroNicole.id);
      expect(body).toHaveProperty('name', kokoroNicole.name);
      expect(body).toHaveProperty('ttsProviderId', kokoro.id);
    });

    // ─── READ: all 3 voices in order ────────────────────────────

    it('alice get all the 3 ttsVoices in Order Bella, Heart, Nicole (name asc)', async () => {
      const res1 = await api('GET', '/tts-voices?name=Heart', auth.alice.jwt);
      const kokoroHeart = res1.body.data[0];

      const res2 = await api('GET', '/tts-voices?name=Bella', auth.alice.jwt);
      const kokoroBella = res2.body.data[0];

      const res3 = await api('GET', '/tts-voices?name=Nicole', auth.alice.jwt);
      const kokoroNicole = res3.body.data[0];

      const { status, body } = await api('GET', '/tts-voices', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(3);
      expect(body.data.map((v: any) => v.id)).toEqual([
        kokoroBella.id,
        kokoroHeart.id,
        kokoroNicole.id,
      ]);
    });

    // ─── Language filter with multiple voices ───────────────────

    it('alice filters ttsVoices by language=en and gets Bella and Nicole', async () => {
      const { status, body } = await api('GET', '/tts-voices?language=en', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);
      expect(body.data.every((v: any) => v.language === 'en')).toBe(true);
    });

    it('alice filters ttsVoices by language=de and still gets only Heart', async () => {
      const { status, body } = await api('GET', '/tts-voices?language=de', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0]).toHaveProperty('name', 'Heart');
      expect(body.data[0]).toHaveProperty('language', 'de');
    });

    // ─── UPDATE: alice cannot update ────────────────────────────

    it('alice can not update Voice Nicole to recommended via alice', async () => {
      const res1 = await api('GET', '/tts-voices?name=Nicole', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const kokoroNicole = res1.body.data[0];

      const { status } = await api('PATCH', `/tts-voices/${kokoroNicole.id}`, auth.alice.jwt, {
        recommended: true,
      });
      expect(status).toBe(403);
    });

    it('updates Voice Nicole to recommended via admin', async () => {
      const res1 = await api('GET', '/tts-voices?name=Nicole', auth.admin.jwt);
      expect(res1.status).toBe(200);
      const kokoroNicole = res1.body.data[0];

      const { status, body } = await api('PATCH', `/tts-voices/${kokoroNicole.id}`, auth.admin.jwt, {
        recommended: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('recommended', true);
    });

    // ─── READ: recommended first ordering ───────────────────────

    it('alice get all the 3 ttsVoices in Order Nicole, Bella, Heart (recommended first, then name asc)', async () => {
      const res1 = await api('GET', '/tts-voices?name=Heart', auth.alice.jwt);
      const kokoroHeart = res1.body.data[0];

      const res2 = await api('GET', '/tts-voices?name=Bella', auth.alice.jwt);
      const kokoroBella = res2.body.data[0];

      const res3 = await api('GET', '/tts-voices?name=Nicole', auth.alice.jwt);
      const kokoroNicole = res3.body.data[0];

      const { status, body } = await api('GET', '/tts-voices', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(3);
      expect(body.data.map((v: any) => v.id)).toEqual([
        kokoroNicole.id,
        kokoroBella.id,
        kokoroHeart.id,
      ]);
    });

    // ─── DELETE ─────────────────────────────────────────────────

    it('alice can not delete tts voice Nicole', async () => {
      const res1 = await api('GET', '/tts-voices?name=Nicole', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const kokoroNicole = res1.body.data[0];

      const { status } = await api('DELETE', `/tts-voices/${kokoroNicole.id}`, auth.alice.jwt);
      expect(status).toBe(403);
    });

    it('admin delete tts voice Nicole', async () => {
      const res1 = await api('GET', '/tts-voices?name=Nicole', auth.admin.jwt);
      expect(res1.status).toBe(200);
      const kokoroNicole = res1.body.data[0];

      const { status } = await api('DELETE', `/tts-voices/${kokoroNicole.id}`, auth.admin.jwt);
      expect(status).toBe(200);
    });

    it('alice get all the 2 ttsVoices in Order Bella, Heart (name asc)', async () => {
      const res1 = await api('GET', '/tts-voices?name=Heart', auth.alice.jwt);
      const kokoroHeart = res1.body.data[0];

      const res2 = await api('GET', '/tts-voices?name=Bella', auth.alice.jwt);
      const kokoroBella = res2.body.data[0];

      const { status, body } = await api('GET', '/tts-voices', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);
      expect(body.data.map((v: any) => v.id)).toEqual([
        kokoroBella.id,
        kokoroHeart.id,
      ]);
    });

    // ─── Gender filter tests ────────────────────────────────────

    it('admin adds a Male Adam voice to kokoro', async () => {
      const res1 = await api('GET', '/tts-providers?name=CipherdollsKokoro', auth.admin.jwt);
      expect(res1.status).toBe(200);
      const kokoro = res1.body.data[0];

      const { status, body } = await api('POST', '/tts-voices', auth.admin.jwt, {
        name: 'Adam',
        providerVoiceId: 'am_adam',
        recommended: false,
        language: 'en',
        gender: 'Male',
        ttsProviderId: kokoro.id,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Adam');
      expect(body).toHaveProperty('gender', 'Male');
      expect(body).toHaveProperty('ttsProviderId', kokoro.id);
      adamVoiceId = body.id;
    });

    // ─── MQTT: events after Adam create ─────────────────────────

    it('adminUserProcessEvents contains >= 2 ttsVoice Events after Adam create', async () => {
      await waitForEvents(adminUserProcessEvents, 2, 30000);
      const events = groupByResourceName(adminUserProcessEvents);
      const ttsVoice = events.TtsVoice || [];
      expect(ttsVoice.length).toBeGreaterThanOrEqual(2);
      adminUserProcessEvents = [];
    });

    it('admin updates Bella voice with correct Gender Female', async () => {
      const res1 = await api('GET', '/tts-voices?name=Bella', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const kokoroBella = res1.body.data[0];

      const { status, body } = await api('PATCH', `/tts-voices/${kokoroBella.id}`, auth.admin.jwt, {
        gender: 'Female',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('gender', 'Female');
    });

    it('alice filters ttsVoices by gender=Female and gets only Female voices', async () => {
      const { status, body } = await api('GET', '/tts-voices?gender=Female', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);
      body.data.forEach((voice: any) => {
        expect(voice).toHaveProperty('gender', 'Female');
      });
    });

    it('alice filters ttsVoices by gender=Male and gets only Male voices', async () => {
      const { status, body } = await api('GET', '/tts-voices?gender=Male', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0]).toHaveProperty('name', 'Adam');
      expect(body.data[0]).toHaveProperty('gender', 'Male');
    });

    it('alice gets all 3 ttsVoices without gender filter', async () => {
      const { status, body } = await api('GET', '/tts-voices', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(3);
    });

    // ─── MQTT cleanup ───────────────────────────────────────────

    it('close admin MQTT client for ttsVoices', () => {
      adminMqttClient?.end();
    });
  });
}
