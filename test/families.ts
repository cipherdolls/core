
import { auth, api, get, connectMqtt, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient } from './helpers';
import { hanaAvatarId, freyaAvatarId, joiAvatarId } from './avatars';

export let aliceFamilyId: string;

export function describeFamilies() {
  describe('Families', () => {
    let aliceMqttClient: MqttClient;
    let aliceUserProcessEvents: ProcessEvent[] = [];

    let bobMqttClient: MqttClient;
    let bobUserProcessEvents: ProcessEvent[] = [];

    let bobFamilyId: string;

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect alice MQTT client for families', async () => {
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
      aliceMqttClient.subscribe(`users/${auth.alice.userId}/processEvents`);
      aliceMqttClient.on('message', (_topic, msg) => {
        aliceUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    it('connect bob MQTT client for families', async () => {
      bobMqttClient = await connectMqtt(auth.bob.jwt);
      bobMqttClient.subscribe(`users/${auth.bob.userId}/processEvents`);
      bobMqttClient.on('message', (_topic, msg) => {
        bobUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    it('aliceUserProcessEvents contains 0 Events initially', async () => {
      await waitForQueuesEmpty(60000);
      expect(aliceUserProcessEvents.length).toBe(0);
      aliceUserProcessEvents = [];
    });

    // ─── Token balance enforcement ─────────────────────────────

    it('guest can not create a family without spendable tokens (403)', async () => {
      const { status } = await api('POST', '/families', auth.guest.jwt, {
        name: 'Guest Family',
      });
      expect(status).toBe(403);
    });

    // ─── Empty state ───────────────────────────────────────────

    it('alice has no families initially', async () => {
      const { status, body } = await api('GET', '/families?mine=true', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(0);
      expect(body.data.length).toBe(0);
    });

    // ─── Alice creates a private family bundling hana + freya ──

    it('alice creates a private family bundling hana and freya', async () => {
      const { status, body } = await api('POST', '/families', auth.alice.jwt, {
        name: 'Nordic Sisters',
        shortDesc: 'The nordic avatar bundle',
        avatarIds: [hanaAvatarId, freyaAvatarId],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Nordic Sisters');
      expect(body).toHaveProperty('slug', 'nordic-sisters');
      expect(body).toHaveProperty('shortDesc', 'The nordic avatar bundle');
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('userId', auth.alice.userId);
      expect(Array.isArray(body.avatars)).toBe(true);
      expect(body.avatars).toHaveLength(2);
      aliceFamilyId = body.id;
    });

    it('aliceUserProcessEvents contains 2 Family events after create', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(aliceUserProcessEvents);
      const family = events.Family || [];
      expect(family.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    it('alice gets her private family by id', async () => {
      const { status, body } = await api('GET', `/families/${aliceFamilyId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', aliceFamilyId);
      expect(body).toHaveProperty('slug', 'nordic-sisters');
      expect(body.avatars).toHaveLength(2);
    });

    it('alice gets her private family by slug', async () => {
      const { status, body } = await api('GET', '/families/nordic-sisters', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', aliceFamilyId);
    });

    // ─── Cross-user access on private family ───────────────────

    it('bob does not get alice private family (403)', async () => {
      const { status } = await api('GET', `/families/${aliceFamilyId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    it('unauthenticated user does not get alice private family (403)', async () => {
      const { status } = await get('/families/nordic-sisters');
      expect(status).toBe(403);
    });

    // ─── Slug validation ───────────────────────────────────────

    it('alice can not create a family with a taken slug (409)', async () => {
      const { status, body } = await api('POST', '/families', auth.alice.jwt, {
        name: 'Nordic Sisters',
      });
      expect(status).toBe(409);
      expect(body.message).toContain('already taken');
    });

    it('alice can not create a family with an invalid slug (400)', async () => {
      const { status, body } = await api('POST', '/families', auth.alice.jwt, {
        name: 'Bad Slug Family',
        slug: 'Bad Slug!',
      });
      expect(status).toBe(400);
      expect(body.message).toContain('slug');
    });

    // ─── Avatar access rules ───────────────────────────────────

    it('alice can not bundle bob private joi avatar (400)', async () => {
      const { status, body } = await api('POST', '/families', auth.alice.jwt, {
        name: 'Sneaky Family',
        avatarIds: [joiAvatarId],
      });
      expect(status).toBe(400);
      expect(body.message).toContain('published avatars or your own avatars');
    });

    it('bob can bundle his own private joi avatar', async () => {
      const { status, body } = await api('POST', '/families', auth.bob.jwt, {
        name: 'Joi Club',
        avatarIds: [joiAvatarId],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('slug', 'joi-club');
      expect(body.avatars).toHaveLength(1);
      bobFamilyId = body.id;
    });

    it('bobUserProcessEvents contains 2 Family events after create', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(bobUserProcessEvents);
      const family = events.Family || [];
      expect(family.length).toBe(2);
      bobUserProcessEvents = [];
    });

    // ─── Publish rules ─────────────────────────────────────────

    it('bob can not publish his family with private joi avatar (400)', async () => {
      const { status, body } = await api('PATCH', `/families/${bobFamilyId}`, auth.bob.jwt, {
        published: true,
      });
      expect(status).toBe(400);
      expect(body.message).toContain('family can only be published if all bundled avatars are published.');
    });

    it('alice publishes her family with published avatars', async () => {
      const { status, body } = await api('PATCH', `/families/${aliceFamilyId}`, auth.alice.jwt, {
        published: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('published', true);
    });

    it('aliceUserProcessEvents contains 2 Family events after publish', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(aliceUserProcessEvents);
      const family = events.Family || [];
      expect(family.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    // ─── Public webapp access by slug ──────────────────────────

    it('unauthenticated webapp fetches published family avatars by slug', async () => {
      const { status, body } = await get('/families/nordic-sisters');
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', aliceFamilyId);
      expect(body).toHaveProperty('name', 'Nordic Sisters');
      expect(body.avatars).toHaveLength(2);
      body.avatars.forEach((a: any) => expect(a.published).toBe(true));
      const names = body.avatars.map((a: any) => a.name).sort();
      expect(names).toEqual(['Freya', 'Hana']);
    });

    it('unauthenticated user lists only published families', async () => {
      const { status, body } = await get('/families');
      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty('slug', 'nordic-sisters');
      expect(body.meta.total).toBe(1);
    });

    it('bob reads alice published family', async () => {
      const { status, body } = await api('GET', '/families/nordic-sisters', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.avatars).toHaveLength(2);
    });

    it('bob lists own + published families', async () => {
      const { status, body } = await api('GET', '/families', auth.bob.jwt);
      expect(status).toBe(200);
      const slugs = body.data.map((f: any) => f.slug).sort();
      expect(slugs).toEqual(['joi-club', 'nordic-sisters']);
      expect(body.meta.total).toBe(2);
    });

    it('name filter is case-insensitive', async () => {
      const { status, body } = await api('GET', '/families?name=nordic', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty('name', 'Nordic Sisters');
    });

    // ─── Cross-user modification ───────────────────────────────

    it('bob can not update alice family (403)', async () => {
      const { status } = await api('PATCH', `/families/${aliceFamilyId}`, auth.bob.jwt, {
        name: 'Hijacked',
      });
      expect(status).toBe(403);
    });

    it('bob can not delete alice family (403)', async () => {
      const { status } = await api('DELETE', `/families/${aliceFamilyId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    // ─── Updates ───────────────────────────────────────────────

    it('alice updates family shortDesc and slug', async () => {
      const { status, body } = await api('PATCH', `/families/${aliceFamilyId}`, auth.alice.jwt, {
        shortDesc: 'Nordic ladies webapp bundle',
        slug: 'nordic-ladies',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('shortDesc', 'Nordic ladies webapp bundle');
      expect(body).toHaveProperty('slug', 'nordic-ladies');
    });

    it('aliceUserProcessEvents contains 2 Family events after update', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(aliceUserProcessEvents);
      const family = events.Family || [];
      expect(family.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    it('family is reachable under the new slug', async () => {
      const { status, body } = await get('/families/nordic-ladies');
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', aliceFamilyId);
    });

    it('old slug no longer resolves (404)', async () => {
      const { status } = await get('/families/nordic-sisters');
      expect(status).toBe(404);
    });

    it('alice can not add bob private joi to her published family (400)', async () => {
      const { status } = await api('PATCH', `/families/${aliceFamilyId}`, auth.alice.jwt, {
        avatarIds: [hanaAvatarId, joiAvatarId],
      });
      expect(status).toBe(400);
    });

    it('alice reduces her family to only hana', async () => {
      const { status, body } = await api('PATCH', `/families/${aliceFamilyId}`, auth.alice.jwt, {
        avatarIds: [hanaAvatarId],
      });
      expect(status).toBe(200);
      expect(body.avatars).toHaveLength(1);
      expect(body.avatars[0]).toHaveProperty('name', 'Hana');
    });

    it('aliceUserProcessEvents contains 2 Family events after avatar change', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(aliceUserProcessEvents);
      const family = events.Family || [];
      expect(family.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    // ─── Delete ────────────────────────────────────────────────

    it('bob deletes his family', async () => {
      const { status } = await api('DELETE', `/families/${bobFamilyId}`, auth.bob.jwt);
      expect(status).toBe(200);
    });

    it('bobUserProcessEvents contains 2 Family events after delete', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(bobUserProcessEvents);
      const family = events.Family || [];
      expect(family.length).toBe(2);
      bobUserProcessEvents = [];
    });

    it('deleting a family does not delete its avatars', async () => {
      const { status, body } = await api('GET', `/avatars/${joiAvatarId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', joiAvatarId);
    });

    it('alice deletes her family', async () => {
      const { status } = await api('DELETE', `/families/${aliceFamilyId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('aliceUserProcessEvents contains 2 Family events after delete', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(aliceUserProcessEvents);
      const family = events.Family || [];
      expect(family.length).toBe(2);
      aliceUserProcessEvents = [];
    });

    it('no published families remain', async () => {
      const { status, body } = await get('/families');
      expect(status).toBe(200);
      expect(body.data).toHaveLength(0);
      expect(body.meta.total).toBe(0);
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
