
import { auth, api, get, connectMqtt, subscribeTopic, waitForEvents, groupByResourceName, type ProcessEvent, type MqttClient } from './helpers';

// Module-level IDs for cross-test imports
export let kokoroProviderId: string;
export let elevenLabsProviderId: string;

export function describeTtsProviders() {
  describe('ttsProvider Controller (e2e)', () => {
    let adminMqttClient: MqttClient;
    let adminUserProcessEvents: ProcessEvent[] = [];

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect admin MQTT client for ttsProviders', async () => {
      adminMqttClient = await connectMqtt(auth.admin.jwt);
      adminMqttClient.subscribe(`users/${auth.admin.userId}/processEvents`);
      adminMqttClient.on('message', (_topic, msg) => {
        adminUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    // ─── READ: no providers exist yet ─────────────────────────────

    it('alice gets no tts Providers', async () => {
      const { status, body } = await api('GET', '/tts-providers', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    it('bob gets no tts Providers', async () => {
      const { status, body } = await api('GET', '/tts-providers', auth.bob.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    it('guest gets no tts Providers', async () => {
      const { status, body } = await api('GET', '/tts-providers', auth.guest.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    it('anonymous gets no tts Providers', async () => {
      const { status, body } = await get('/tts-providers');
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── WRITE: only admin can create ─────────────────────────────

    it('alice cannot create a tts Provider', async () => {
      const { status } = await api('POST', '/tts-providers', auth.alice.jwt, {
        name: 'CipherdollsKokoro', dollarPerCharacter: 0,
      });
      expect(status).toBe(403);
    });

    it('bob cannot create a tts Provider', async () => {
      const { status } = await api('POST', '/tts-providers', auth.bob.jwt, {
        name: 'CipherdollsKokoro', dollarPerCharacter: 0,
      });
      expect(status).toBe(403);
    });

    it('guest cannot create a tts Provider', async () => {
      const { status } = await api('POST', '/tts-providers', auth.guest.jwt, {
        name: 'CipherdollsKokoro', dollarPerCharacter: 0,
      });
      expect(status).toBe(403);
    });

    it('anonymous cannot create a tts Provider', async () => {
      const res = await fetch(`${process.env.BASE_URL ?? 'http://localhost:4000'}/tts-providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'CipherdollsKokoro', dollarPerCharacter: 0 }),
      });
      expect(res.status).toBe(401);
    });

    // ─── ADMIN creates Kokoro provider ──────────────────────────

    it('admin creates a Kokoro tts Provider', async () => {
      const { status, body } = await api('POST', '/tts-providers', auth.admin.jwt, {
        name: 'CipherdollsKokoro', dollarPerCharacter: 0,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('censored', true);
      expect(body).toHaveProperty('name', 'CipherdollsKokoro');
      expect(Number(body.dollarPerCharacter)).toBe(0);
      kokoroProviderId = body.id;
    });

    // ─── MQTT: events after Kokoro create ──────────────────────

    it('adminUserProcessEvents contains 2 Events after Kokoro create', async () => {
      await waitForEvents(adminUserProcessEvents, 2, 30000);
      const events = groupByResourceName(adminUserProcessEvents);
      const ttsProviders = events.TtsProvider || [];
      expect(ttsProviders.length).toBe(2);
      expect(ttsProviders.some((e: ProcessEvent) => e.jobStatus === 'active')).toBe(true);
      expect(ttsProviders.some((e: ProcessEvent) => e.jobStatus === 'completed')).toBe(true);
      adminUserProcessEvents = [];
    });

    // ─── READ: 1 provider exists ──────────────────────────────────

    it('alice gets 1 tts Provider', async () => {
      const { status, body } = await api('GET', '/tts-providers', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('bob gets 1 tts Provider', async () => {
      const { status, body } = await api('GET', '/tts-providers', auth.bob.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('guest gets 1 tts Provider', async () => {
      const { status, body } = await api('GET', '/tts-providers', auth.guest.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('anonymous gets 1 tts Provider', async () => {
      const { status, body } = await get('/tts-providers');
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    // ─── READ: get Kokoro provider by ID ────────────────────────

    it('alice gets Kokoro tts Provider by id', async () => {
      const { status, body } = await api('GET', `/tts-providers/${kokoroProviderId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', kokoroProviderId);
      expect(body).toHaveProperty('name', 'CipherdollsKokoro');
      expect(body).toHaveProperty('censored', true);
    });

    it('bob gets Kokoro tts Provider by id', async () => {
      const { status, body } = await api('GET', `/tts-providers/${kokoroProviderId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', kokoroProviderId);
      expect(body).toHaveProperty('name', 'CipherdollsKokoro');
    });

    it('guest gets Kokoro tts Provider by id', async () => {
      const { status, body } = await api('GET', `/tts-providers/${kokoroProviderId}`, auth.guest.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', kokoroProviderId);
      expect(body).toHaveProperty('name', 'CipherdollsKokoro');
    });

    it('anonymous gets Kokoro tts Provider by id', async () => {
      const { status, body } = await get(`/tts-providers/${kokoroProviderId}`);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', kokoroProviderId);
      expect(body).toHaveProperty('name', 'CipherdollsKokoro');
      expect(body).toHaveProperty('censored', true);
    });

    // ─── WRITE: only admin can update ─────────────────────────────

    it('alice cannot update the Kokoro tts Provider', async () => {
      const { status } = await api('PATCH', `/tts-providers/${kokoroProviderId}`, auth.alice.jwt, {
        name: 'CipherdollsKokoro', dollarPerCharacter: 0, censored: false,
      });
      expect(status).toBe(403);
    });

    it('bob cannot update the Kokoro tts Provider', async () => {
      const { status } = await api('PATCH', `/tts-providers/${kokoroProviderId}`, auth.bob.jwt, {
        name: 'CipherdollsKokoro', dollarPerCharacter: 0, censored: false,
      });
      expect(status).toBe(403);
    });

    it('guest cannot update the Kokoro tts Provider', async () => {
      const { status } = await api('PATCH', `/tts-providers/${kokoroProviderId}`, auth.guest.jwt, {
        name: 'CipherdollsKokoro', dollarPerCharacter: 0, censored: false,
      });
      expect(status).toBe(403);
    });

    it('anonymous cannot update the Kokoro tts Provider', async () => {
      const res = await fetch(`${process.env.BASE_URL ?? 'http://localhost:4000'}/tts-providers/${kokoroProviderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'CipherdollsKokoro', dollarPerCharacter: 0, censored: false }),
      });
      expect(res.status).toBe(401);
    });

    // ─── ADMIN updates Kokoro provider ──────────────────────────

    it('admin updates the Kokoro tts Provider censored to false', async () => {
      const { status, body } = await api('PATCH', `/tts-providers/${kokoroProviderId}`, auth.admin.jwt, {
        name: 'CipherdollsKokoro', dollarPerCharacter: 0, censored: false,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', kokoroProviderId);
      expect(body).toHaveProperty('censored', false);
    });

    // ─── MQTT: events after Kokoro update ──────────────────────

    it('adminUserProcessEvents contains 2 Events after Kokoro update', async () => {
      await waitForEvents(adminUserProcessEvents, 2, 30000);
      const events = groupByResourceName(adminUserProcessEvents);
      const ttsProviders = events.TtsProvider || [];
      expect(ttsProviders.length).toBe(2);
      expect(ttsProviders.some((e: ProcessEvent) => e.jobStatus === 'active')).toBe(true);
      expect(ttsProviders.some((e: ProcessEvent) => e.jobStatus === 'completed')).toBe(true);
      adminUserProcessEvents = [];
    });

    it('alice reads Kokoro tts Provider and sees censored is false', async () => {
      const { status, body } = await api('GET', `/tts-providers/${kokoroProviderId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', kokoroProviderId);
      expect(body).toHaveProperty('censored', false);
    });

    // ─── ADMIN creates ElevenLabs provider ──────────────────────

    it('admin creates an ElevenLabs tts Provider', async () => {
      const { status, body } = await api('POST', '/tts-providers', auth.admin.jwt, {
        name: 'ElevenLabs', dollarPerCharacter: 0.00011,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('censored', true);
      expect(body).toHaveProperty('name', 'ElevenLabs');
      expect(Number(body.dollarPerCharacter)).toBeCloseTo(0.00011);
      elevenLabsProviderId = body.id;
    });

    // ─── MQTT: events after ElevenLabs create ──────────────────

    it('adminUserProcessEvents contains 2 Events after ElevenLabs create', async () => {
      await waitForEvents(adminUserProcessEvents, 2, 30000);
      const events = groupByResourceName(adminUserProcessEvents);
      const ttsProviders = events.TtsProvider || [];
      expect(ttsProviders.length).toBe(2);
      expect(ttsProviders.some((e: ProcessEvent) => e.jobStatus === 'active')).toBe(true);
      expect(ttsProviders.some((e: ProcessEvent) => e.jobStatus === 'completed')).toBe(true);
      adminUserProcessEvents = [];
    });

    // ─── READ: 2 providers exist ──────────────────────────────────

    it('alice gets 2 tts Providers', async () => {
      const { status, body } = await api('GET', '/tts-providers', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);
    });

    it('bob gets 2 tts Providers', async () => {
      const { status, body } = await api('GET', '/tts-providers', auth.bob.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);
    });

    it('guest gets 2 tts Providers', async () => {
      const { status, body } = await api('GET', '/tts-providers', auth.guest.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);
    });

    it('anonymous gets 2 tts Providers', async () => {
      const { status, body } = await get('/tts-providers');
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);
    });

    // ─── READ: non-existent provider ────────────────────────────

    it('alice gets 404 for non-existent tts Provider', async () => {
      const { status } = await api('GET', '/tts-providers/00000000-0000-0000-0000-000000000000', auth.alice.jwt);
      expect(status).toBe(404);
    });

    // ─── WRITE: only admin can delete ─────────────────────────────

    it('alice cannot delete the ElevenLabs tts Provider', async () => {
      const { status } = await api('DELETE', `/tts-providers/${elevenLabsProviderId}`, auth.alice.jwt);
      expect(status).toBe(403);
    });

    it('bob cannot delete the ElevenLabs tts Provider', async () => {
      const { status } = await api('DELETE', `/tts-providers/${elevenLabsProviderId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    it('guest cannot delete the ElevenLabs tts Provider', async () => {
      const { status } = await api('DELETE', `/tts-providers/${elevenLabsProviderId}`, auth.guest.jwt);
      expect(status).toBe(403);
    });

    it('anonymous cannot delete the ElevenLabs tts Provider', async () => {
      const res = await fetch(`${process.env.BASE_URL ?? 'http://localhost:4000'}/tts-providers/${elevenLabsProviderId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });

    // ─── ADMIN deletes ElevenLabs provider ──────────────────────

    it('admin deletes the ElevenLabs tts Provider', async () => {
      const { status } = await api('DELETE', `/tts-providers/${elevenLabsProviderId}`, auth.admin.jwt);
      expect(status).toBe(200);
    });

    // ─── MQTT: events after ElevenLabs delete ──────────────────

    it('adminUserProcessEvents contains 2 Events after ElevenLabs delete', async () => {
      await waitForEvents(adminUserProcessEvents, 2, 30000);
      const events = groupByResourceName(adminUserProcessEvents);
      const ttsProviders = events.TtsProvider || [];
      expect(ttsProviders.length).toBe(2);
      expect(ttsProviders.some((e: ProcessEvent) => e.jobStatus === 'active')).toBe(true);
      expect(ttsProviders.some((e: ProcessEvent) => e.jobStatus === 'completed')).toBe(true);
      adminUserProcessEvents = [];
    });

    // ─── READ: verify after delete ──────────────────────────────

    it('alice gets 1 tts Provider after delete', async () => {
      const { status, body } = await api('GET', '/tts-providers', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0]).toHaveProperty('id', kokoroProviderId);
    });

    it('anonymous gets 1 tts Provider after delete', async () => {
      const { status, body } = await get('/tts-providers');
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
    });

    it('admin gets deleted ElevenLabs tts Provider as 404', async () => {
      const { status } = await api('GET', `/tts-providers/${elevenLabsProviderId}`, auth.admin.jwt);
      expect(status).toBe(404);
    });

    // ─── MQTT cleanup ───────────────────────────────────────────

    it('close admin MQTT client for ttsProviders', () => {
      adminMqttClient?.end();
    });
  });
}
