
import { auth, api, get, connectMqtt, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient, BASE_URL } from './helpers';

export function describeSponsorships() {
  describe('Sponsorships', () => {
    let aliceMqttClient: MqttClient;
    let aliceUserProcessEvents: ProcessEvent[] = [];

    let bobDeepTalkScenarioId: string;
    let aliceSponsorshipId: string;
    let deletedSponsorshipId: string;

    // ─── MQTT setup ──────────────────────────────────────────

    it('connect alice MQTT client for sponsorships', async () => {
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
      aliceMqttClient.subscribe(`users/${auth.alice.userId}/processEvents`);
      aliceMqttClient.on('message', (_topic, msg) => {
        aliceUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    // ─── Balance check ───────────────────────────────────────

    it('3.25 tokenSpendable for alice', async () => {
      const { body } = await api('GET', '/users/me', auth.alice.jwt);
      expect(body.tokenSpendable).toBe(3.25);
    });

    // ─── Setup: fetch scenario ───────────────────────────────

    it('fetch bobDeepTalkScenario', async () => {
      const { body } = await api('GET', '/scenarios?published=true&nsfw=true', auth.bob.jwt);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      bobDeepTalkScenarioId = body.data[0].id;
    });

    // ─── Anonymous access & validation ───────────────────────

    it('anonymous POST /sponsorships returns 401', async () => {
      const res = await fetch(`${BASE_URL}/sponsorships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: '00000000-0000-0000-0000-000000000000' }),
      });
      expect(res.status).toBe(401);
    });

    it('anonymous GET /sponsorships returns 401', async () => {
      const { status } = await get('/sponsorships');
      expect(status).toBe(401);
    });

    it('anonymous GET /sponsorships/:id returns 401', async () => {
      const { status } = await get('/sponsorships/00000000-0000-0000-0000-000000000000');
      expect(status).toBe(401);
    });

    it('anonymous DELETE /sponsorships/:id returns 401', async () => {
      const res = await fetch(`${BASE_URL}/sponsorships/00000000-0000-0000-0000-000000000000`, { method: 'DELETE' });
      expect(res.status).toBe(401);
    });

    it('POST /sponsorships with missing scenarioId returns 422', async () => {
      const { status } = await api('POST', '/sponsorships', auth.alice.jwt, {});
      expect(status).toBe(422);
    });

    it('POST /sponsorships with nonexistent scenarioId returns 404', async () => {
      const { status } = await api('POST', '/sponsorships', auth.alice.jwt, {
        scenarioId: '00000000-0000-0000-0000-000000000000',
      });
      expect(status).toBe(404);
    });

    // ─── Alice creates sponsorship ───────────────────────────

    it('alice post a Sponsorship for bobDeepTalkScenario', async () => {
      aliceUserProcessEvents = [];
      const { status, body } = await api('POST', '/sponsorships', auth.alice.jwt, {
        scenarioId: bobDeepTalkScenarioId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', bobDeepTalkScenarioId);
      expect(body).toHaveProperty('userId', auth.alice.userId);
      aliceSponsorshipId = body.id;
    });

    it('aliceUserProcessEvents contains >= 2 Events after sponsorship create', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(aliceUserProcessEvents);
      const sponsorshipEvents = events.Sponsorship || [];
      expect(sponsorshipEvents.length).toBeGreaterThanOrEqual(2);
      expect(sponsorshipEvents.some((e: ProcessEvent) => e.jobStatus === 'active')).toBe(true);
      expect(sponsorshipEvents.some((e: ProcessEvent) => e.jobStatus === 'completed')).toBe(true);
      aliceUserProcessEvents = [];
    });

    it('alice failed to post a second Sponsorship for bobDeepTalkScenario', async () => {
      const { status } = await api('POST', '/sponsorships', auth.alice.jwt, {
        scenarioId: bobDeepTalkScenarioId,
      });
      expect(status).toBe(403);
    });

    // ─── Guest cannot sponsor ────────────────────────────────

    it('0 tokenSpendable for guest', async () => {
      const { body } = await api('GET', '/users/me', auth.guest.jwt);
      expect(body.tokenSpendable).toBe(0);
    });

    it('guest failed to post a Sponsorship', async () => {
      const { status, body } = await api('POST', '/sponsorships', auth.guest.jwt, {
        scenarioId: bobDeepTalkScenarioId,
      });
      expect(status).toBe(403);
      expect(body).toHaveProperty('message');
    });

    // ─── Get sponsorships ────────────────────────────────────

    it('get alice sponsorships', async () => {
      const { status, body } = await api('GET', '/sponsorships', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    it('get bob sponsorships', async () => {
      const { status, body } = await api('GET', '/sponsorships', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    // ─── Cross-user reads & filters ──────────────────────────

    it('bob GET /sponsorships/:id of alice sponsorship returns 200', async () => {
      const { status, body } = await api('GET', `/sponsorships/${aliceSponsorshipId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', aliceSponsorshipId);
      expect(body).toHaveProperty('userId', auth.alice.userId);
    });

    it('guest GET /sponsorships/:id of alice sponsorship returns 200', async () => {
      const { status, body } = await api('GET', `/sponsorships/${aliceSponsorshipId}`, auth.guest.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', aliceSponsorshipId);
    });

    it('admin GET /sponsorships returns all sponsorships', async () => {
      const { status, body } = await api('GET', '/sponsorships', auth.admin.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /sponsorships?scenarioId filters correctly', async () => {
      const { status, body } = await api('GET', `/sponsorships?scenarioId=${bobDeepTalkScenarioId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
      expect(body.data[0]).toHaveProperty('scenarioId', bobDeepTalkScenarioId);
    });

    it('GET /sponsorships?scenarioId with nonexistent id returns empty', async () => {
      const { status, body } = await api('GET', '/sponsorships?scenarioId=00000000-0000-0000-0000-000000000000', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    it('get aliceSponsorshipId sponsorship by id', async () => {
      const { status, body } = await api('GET', `/sponsorships/${aliceSponsorshipId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', aliceSponsorshipId);
      expect(body).toHaveProperty('scenarioId', bobDeepTalkScenarioId);
      expect(body).toHaveProperty('userId', auth.alice.userId);
    });

    // ─── Delete authorization ────────────────────────────────

    it('bob can not delete alice sponsorship', async () => {
      const { status } = await api('DELETE', `/sponsorships/${aliceSponsorshipId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    it('admin can not delete alice sponsorship', async () => {
      const { status } = await api('DELETE', `/sponsorships/${aliceSponsorshipId}`, auth.admin.jwt);
      expect(status).toBe(403);
    });

    it('guest can not delete alice sponsorship', async () => {
      const { status } = await api('DELETE', `/sponsorships/${aliceSponsorshipId}`, auth.guest.jwt);
      expect(status).toBe(403);
    });

    it('alice deletes her sponsorship', async () => {
      aliceUserProcessEvents = [];
      deletedSponsorshipId = aliceSponsorshipId;
      const { status } = await api('DELETE', `/sponsorships/${aliceSponsorshipId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('aliceUserProcessEvents contains >= 2 Events after sponsorship delete', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(aliceUserProcessEvents);
      const sponsorshipEvents = events.Sponsorship || [];
      expect(sponsorshipEvents.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('get 0 sponsorships as alice', async () => {
      const { status, body } = await api('GET', '/sponsorships', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    it('get 0 sponsorships as bob', async () => {
      const { status, body } = await api('GET', '/sponsorships', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    // ─── Post-deletion edge cases ────────────────────────────

    it('GET deleted sponsorship by id returns 404', async () => {
      const { status } = await api('GET', `/sponsorships/${deletedSponsorshipId}`, auth.alice.jwt);
      expect(status).toBe(404);
    });

    it('DELETE already-deleted sponsorship returns 404', async () => {
      const { status } = await api('DELETE', `/sponsorships/${deletedSponsorshipId}`, auth.alice.jwt);
      expect(status).toBe(404);
    });

    it('bob fails to sponsor his own scenario with insufficient tokens', async () => {
      const { status, body } = await api('POST', '/sponsorships', auth.bob.jwt, {
        scenarioId: bobDeepTalkScenarioId,
      });
      expect(status).toBe(403);
      expect(body).toHaveProperty('message');
    });

    // ─── Re-create sponsorship for downstream tests ──────────

    it('alice post a sponsorship again', async () => {
      const { status, body } = await api('POST', '/sponsorships', auth.alice.jwt, {
        scenarioId: bobDeepTalkScenarioId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('scenarioId', bobDeepTalkScenarioId);
      expect(body).toHaveProperty('userId', auth.alice.userId);
      aliceSponsorshipId = body.id;
    });

    // ─── Auto-remove sponsorship when tokenSpendable < 1 ─────

    it('alice has a sponsorship before token drop', async () => {
      const { body } = await api('GET', '/sponsorships', auth.alice.jwt);
      expect(body.data.length).toBe(1);
    });

    it('admin sets alice tokenSpendable to 0.5 (below 1)', async () => {
      aliceUserProcessEvents = [];
      const { status } = await api('PATCH', `/users/${auth.alice.userId}`, auth.admin.jwt, {
        tokenSpendable: 0.5,
      });
      expect(status).toBe(200);
    });

    it('wait for user processor to auto-remove sponsorship', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
    });

    it('alice sponsorship was auto-removed', async () => {
      const { body } = await api('GET', '/sponsorships', auth.alice.jwt);
      expect(body.data.length).toBe(0);
    });

    it('restore alice tokenSpendable', async () => {
      const { status } = await api('PATCH', `/users/${auth.alice.userId}`, auth.admin.jwt, {
        tokenSpendable: 3.25,
      });
      expect(status).toBe(200);
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      aliceUserProcessEvents = [];
    });

    // ─── MQTT cleanup ────────────────────────────────────────

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

    it('close alice MQTT client for sponsorships', () => {
      aliceMqttClient?.end();
    });
  });
}
