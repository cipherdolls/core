
import { auth, api, connectMqtt, waitForQueuesEmpty, groupByResourceName, BASE_URL, type ProcessEvent, type MqttClient } from './helpers';

export function describeFillerWords() {
  describe('fillerWords Controller (e2e)', () => {
    let aliceMqttClient: MqttClient;
    let aliceUserProcessEvents: ProcessEvent[] = [];

    let hanaAvatarId: string;
    let createdFillerWordId: string;

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect alice MQTT client for fillerWords', async () => {
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
      aliceMqttClient.subscribe(`users/${auth.alice.userId}/processEvents`);
      aliceMqttClient.on('message', (_topic, msg) => {
        aliceUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    // ─── Resolve seed data ──────────────────────────────────────

    it('resolve hana avatar for fillerWords', async () => {
      const { body: avatars } = await api('GET', '/avatars?name=Hana', auth.alice.jwt);
      expect(avatars.data.length).toBeGreaterThan(0);
      hanaAvatarId = avatars.data[0].id;
    });

    // ─── Drain events ───────────────────────────────────────────

    it('aliceUserProcessEvents contains 0 Events initially', async () => {
      await new Promise((r) => setTimeout(r, 1000));
      expect(aliceUserProcessEvents.length).toBe(0);
      aliceUserProcessEvents = [];
    });

    // ─── Alice creates a filler word ────────────────────────────

    it('alice creates a filler word "okay" for hana avatar', async () => {
      const { status, body } = await api('POST', '/filler-words', auth.alice.jwt, {
        text: 'okay',
        avatarId: hanaAvatarId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('text', 'okay');
      expect(body).toHaveProperty('avatarId', hanaAvatarId);
      expect(body.fileName).toBeNull();
      createdFillerWordId = body.id;
    });

    it('aliceUserProcessEvents contains 2 Events (created active+completed) for FillerWord', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const fillerWord = processEvents.FillerWord || [];
      expect(fillerWord.length).toBe(2);
      expect(aliceUserProcessEvents.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    it('alice gets her filler word with audio record after processing', async () => {
      const { status, body } = await api('GET', `/filler-words/${createdFillerWordId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', createdFillerWordId);
      expect(body).toHaveProperty('text', 'okay');
      expect(body).toHaveProperty('avatarId', hanaAvatarId);
      expect(body).toHaveProperty('audio');
      expect(body.audio).not.toBeNull();
      expect(body.audio).toHaveProperty('id');
      expect(body.audio).toHaveProperty('fillerWordId', createdFillerWordId);
    });

    it('filler word audio can be served via audios endpoint', async () => {
      const res = await fetch(`${BASE_URL}/audios/by/filler-words/${createdFillerWordId}/audio.mp3`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('audio/mpeg');
    });

    // ─── Alice creates more filler words ────────────────────────

    it('alice creates filler word "yeah"', async () => {
      const { status, body } = await api('POST', '/filler-words', auth.alice.jwt, {
        text: 'yeah',
        avatarId: hanaAvatarId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('text', 'yeah');
    });

    it('alice creates filler word "so"', async () => {
      const { status, body } = await api('POST', '/filler-words', auth.alice.jwt, {
        text: 'so',
        avatarId: hanaAvatarId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('text', 'so');
    });

    it('aliceUserProcessEvents contains 4 Events for 2 new filler words', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const fillerWord = processEvents.FillerWord || [];
      expect(fillerWord.length).toBe(4);
      aliceUserProcessEvents = [];
    });

    it('alice lists all filler words for hana avatar', async () => {
      const { status, body } = await api('GET', `/filler-words?avatarId=${hanaAvatarId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('meta');
      expect(body.meta.total).toBe(3);
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(3);
    });

    // ─── Bob cannot create or delete filler words on alice avatar ─

    it('bob cannot create filler word on alice avatar', async () => {
      const { status } = await api('POST', '/filler-words', auth.bob.jwt, {
        text: 'hmm',
        avatarId: hanaAvatarId,
      });
      expect(status).toBe(403);
    });

    it('bob cannot delete alice filler word', async () => {
      const { status } = await api('DELETE', `/filler-words/${createdFillerWordId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    // ─── Alice updates a filler word text (triggers re-generation) ─

    it('alice updates filler word text', async () => {
      const { status, body } = await api('PATCH', `/filler-words/${createdFillerWordId}`, auth.alice.jwt, {
        text: 'alright',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('text', 'alright');
    });

    it('aliceUserProcessEvents contains 2 Events for update (text change active+completed)', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const fillerWord = processEvents.FillerWord || [];
      expect(fillerWord.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    // ─── Alice deletes a filler word ────────────────────────────

    it('alice deletes a filler word', async () => {
      const { status } = await api('DELETE', `/filler-words/${createdFillerWordId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('alice now has 2 filler words', async () => {
      const { status, body } = await api('GET', `/filler-words?avatarId=${hanaAvatarId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(2);
      expect(body.data.length).toBe(2);
    });

    // ─── MQTT cleanup ───────────────────────────────────────────

    it('consume remaining events', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      aliceUserProcessEvents = [];
    });

    it('no unprocessed events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      if (aliceUserProcessEvents.length > 0) console.log('Unprocessed alice user events:', aliceUserProcessEvents.length, aliceUserProcessEvents);
      expect(aliceUserProcessEvents.length).toBe(0);
    });

    it('close alice MQTT client for fillerWords', () => {
      aliceMqttClient?.end();
    });
  });
}
