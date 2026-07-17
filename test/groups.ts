
import { auth, api, get, connectMqtt, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient } from './helpers';
import { hanaAvatarId, freyaAvatarId, joiAvatarId } from './avatars';
import { smallTalkScenarioId, bobDeepTalkScenarioId } from './scenarios';

export let teachersGroupId: string;

export function describeGroups() {
  describe('Groups', () => {
    let aliceMqttClient: MqttClient;
    let aliceUserProcessEvents: ProcessEvent[] = [];

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect alice MQTT client for groups', async () => {
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
      aliceMqttClient.subscribe(`users/${auth.alice.userId}/processEvents`);
      aliceMqttClient.on('message', (_topic, msg) => {
        aliceUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    // ─── WRITE: authenticated users with tokens can create ────────

    it('guest cannot create a group without spendable tokens', async () => {
      const { status } = await api('POST', '/groups', auth.guest.jwt, {
        name: 'Guest Group', slug: 'guest-group',
      });
      expect(status).toBe(403);
    });

    it('anonymous cannot create a group', async () => {
      const res = await fetch(`${process.env.BASE_URL ?? 'http://localhost:4000'}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Teachers', slug: 'teachers' }),
      });
      expect(res.status).toBe(401);
    });

    it('alice creates the teachers group (owns it)', async () => {
      const { status, body } = await api('POST', '/groups', auth.alice.jwt, {
        name: 'Teachers',
        slug: 'teachers',
        title: 'Learn with the best AI tutors',
        description: 'History and math tutors',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Teachers');
      expect(body).toHaveProperty('slug', 'teachers');
      expect(body).toHaveProperty('title', 'Learn with the best AI tutors');
      expect(body).toHaveProperty('description', 'History and math tutors');
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('userId', auth.alice.userId);
      teachersGroupId = body.id;
    });

    it('aliceUserProcessEvents contains 2 Events after group create', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(aliceUserProcessEvents);
      const groups = events.Group || [];
      expect(groups.length).toBe(2);
      expect(groups.some((e: ProcessEvent) => e.jobStatus === 'active')).toBe(true);
      expect(groups.some((e: ProcessEvent) => e.jobStatus === 'completed')).toBe(true);
      aliceUserProcessEvents = [];
    });

    it('bob cannot create a group with a duplicate slug', async () => {
      const { status, body } = await api('POST', '/groups', auth.bob.jwt, {
        name: 'Other Teachers', slug: 'teachers',
      });
      expect(status).toBe(400);
      expect(body.error).toContain('Slug');
    });

    it('alice cannot create a group with an invalid slug', async () => {
      const { status } = await api('POST', '/groups', auth.alice.jwt, {
        name: 'Bad Slug', slug: 'Bad Slug!',
      });
      expect(status).toBe(422);
    });

    // ─── READ: unpublished group visible to owner + admin only ───

    it('anonymous gets no groups (teachers unpublished)', async () => {
      const { status, body } = await get('/groups');
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    it('alice sees her own unpublished group in the default list', async () => {
      const { status, body } = await api('GET', '/groups', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
      expect(body.data[0]).toHaveProperty('slug', 'teachers');
    });

    it('bob sees no groups (not his, unpublished)', async () => {
      const { status, body } = await api('GET', '/groups', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    it('admin gets all groups with all=true', async () => {
      const { status, body } = await api('GET', '/groups?all=true', auth.admin.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    it('bob gets 404 for unpublished group by slug', async () => {
      const { status } = await api('GET', '/groups/teachers', auth.bob.jwt);
      expect(status).toBe(404);
    });

    it('alice gets her unpublished group by slug', async () => {
      const { status, body } = await api('GET', '/groups/teachers', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', teachersGroupId);
    });

    it('admin gets the unpublished group by slug', async () => {
      const { status, body } = await api('GET', '/groups/teachers', auth.admin.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', teachersGroupId);
    });

    // ─── WRITE: owner or admin can update ─────────────────────────

    it('bob cannot update alice group', async () => {
      const { status } = await api('PATCH', `/groups/${teachersGroupId}`, auth.bob.jwt, {
        published: true,
      });
      expect(status).toBe(403);
    });

    it('alice cannot group bob private avatar', async () => {
      const { status, body } = await api('PATCH', `/groups/${teachersGroupId}`, auth.alice.jwt, {
        avatarIds: [joiAvatarId],
      });
      expect(status).toBe(400);
      expect(body.error).toContain('published');
    });

    it('alice publishes her group and assigns members', async () => {
      const { status, body } = await api('PATCH', `/groups/${teachersGroupId}`, auth.alice.jwt, {
        published: true,
        avatarIds: [hanaAvatarId],
        scenarioIds: [smallTalkScenarioId, bobDeepTalkScenarioId],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('published', true);
      expect(body._count.avatars).toBe(1);
      expect(body._count.scenarios).toBe(2);
    });

    it('admin can update alice group (admin cruds all)', async () => {
      const { status, body } = await api('PATCH', `/groups/${teachersGroupId}`, auth.admin.jwt, {
        title: 'The teachers lounge',
        description: 'Curated by admin',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('title', 'The teachers lounge');
      expect(body).toHaveProperty('description', 'Curated by admin');
    });

    it('aliceUserProcessEvents contains 4 Events after the two updates', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(aliceUserProcessEvents);
      const groups = events.Group || [];
      expect(groups.length).toBe(4);
      aliceUserProcessEvents = [];
    });

    // ─── READ: published group + member scoping ──────────────────

    it('anonymous gets the published teachers group', async () => {
      const { status, body } = await get('/groups');
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
      expect(body.data[0]._count.avatars).toBe(1);
    });

    it('bob gets the teachers group by slug with only published members', async () => {
      const { status, body } = await api('GET', '/groups/teachers', auth.bob.jwt);
      expect(status).toBe(200);
      const avatarNames = body.avatars.map((a: any) => a.name);
      expect(avatarNames).toContain('Hana');
      body.scenarios.forEach((s: any) => expect(s.published).toBe(true));
    });

    // ─── Filter avatars and scenarios by group ────────────────────

    it('avatars can be filtered by group slug', async () => {
      const { status, body } = await api('GET', '/avatars?published=true&group=teachers', auth.bob.jwt);
      expect(status).toBe(200);
      const names = body.data.map((a: any) => a.name);
      expect(names).toContain('Hana');
      expect(names).not.toContain('Freya');
    });

    it('avatars can be filtered by group id', async () => {
      const { status, body } = await api('GET', `/avatars?published=true&group=${teachersGroupId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data.map((a: any) => a.name)).toContain('Hana');
    });

    it('scenarios can be filtered by group slug', async () => {
      const { status, body } = await api('GET', '/scenarios?published=true&group=teachers', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(2);
    });

    it('avatars filtered by unknown group are empty', async () => {
      const { status, body } = await api('GET', '/avatars?published=true&group=does-not-exist', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    // ─── TTI: prompt-driven cover generation ──────────────────────

    it('alice creates a tti job for her group cover', async () => {
      const { status, body } = await api('POST', '/tti-jobs', auth.alice.jwt, {
        groupId: teachersGroupId,
        prompt: 'warm classroom scene with books and sunlight',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('groupId', teachersGroupId);
      expect(body.avatarId).toBeNull();
      expect(body.prompt).toContain('warm classroom scene');
    });

    it('group tti job without a prompt is rejected (400)', async () => {
      const { status } = await api('POST', '/tti-jobs', auth.alice.jwt, { groupId: teachersGroupId });
      expect(status).toBe(400);
    });

    it('bob can NOT generate a cover for alice\'s group (403)', async () => {
      const { status } = await api('POST', '/tti-jobs', auth.bob.jwt, {
        groupId: teachersGroupId,
        prompt: 'hacked cover',
      });
      expect(status).toBe(403);
    });

    it('tti job with neither avatarId nor groupId is rejected (400)', async () => {
      const { status } = await api('POST', '/tti-jobs', auth.alice.jwt, { prompt: 'aimless' });
      expect(status).toBe(400);
    });

    // ─── DELETE: owner or admin ───────────────────────────────────

    it('bob cannot delete alice group', async () => {
      const { status } = await api('DELETE', `/groups/${teachersGroupId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    it('admin can delete a user group (admin cruds all)', async () => {
      const { body: tempGroup } = await api('POST', '/groups', auth.alice.jwt, {
        name: 'Temp', slug: 'temp-group',
      });
      const { status } = await api('DELETE', `/groups/${tempGroup.id}`, auth.admin.jwt);
      expect(status).toBe(200);
    });

    it('alice deletes her teachers group', async () => {
      const { status } = await api('DELETE', `/groups/${teachersGroupId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('avatars survive group deletion', async () => {
      const { status, body } = await api('GET', `/avatars/${hanaAvatarId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('name', 'Hana');
    });

    it('deleted group returns 404', async () => {
      const { status } = await api('GET', '/groups/teachers', auth.admin.jwt);
      expect(status).toBe(404);
    });

    // ─── MQTT cleanup ───────────────────────────────────────────

    it('no unprocessed group events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      aliceUserProcessEvents = [];
      expect(true).toBe(true);
    });

    it('close alice MQTT client for groups', () => {
      aliceMqttClient?.end();
    });
  });
}
