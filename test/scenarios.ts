
import { auth, api, get, connectMqtt, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient } from './helpers';
import { chatModelId } from './chatModels';
import { embeddingModelId } from './embeddingModels';
import { reasoningModelId } from './reasoningModels';
import { heartVoiceId } from './ttsVoices';

export let smallTalkScenarioId: string;
export let deepTalkScenarioId: string;
export let notWorkingScenarioId: string;
export let bobDeepTalkScenarioId: string;

export function describeScenarios() {
  describe('Scenarios', () => {
    let aliceMqttClient: MqttClient;
    let aliceUserProcessEvents: ProcessEvent[] = [];

    let bobMqttClient: MqttClient;
    let bobUserProcessEvents: ProcessEvent[] = [];

    // ─── MQTT setup ─────────────────────────────────────────────

    it('connect alice MQTT client for scenarios', async () => {
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
      aliceMqttClient.subscribe(`users/${auth.alice.userId}/processEvents`);
      aliceMqttClient.on('message', (_topic, msg) => {
        aliceUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    it('connect bob MQTT client for scenarios', async () => {
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

    it('bobUserProcessEvents contains 0 Events initially', async () => {
      await waitForQueuesEmpty(60000);
      expect(bobUserProcessEvents.length).toBe(0);
      bobUserProcessEvents = [];
    });

    // ─── Empty state checks ─────────────────────────────────────

    it('get alice empty scenarios', async () => {
      const { status, body } = await api('GET', '/scenarios', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('meta');
      expect(body.meta.total).toBe(0);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(0);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    it('get bob empty scenarios', async () => {
      const { status, body } = await api('GET', '/scenarios', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(0);
      expect(body.data.length).toBe(0);
    });

    // ─── Token balance enforcement ─────────────────────────────

    it('alice has tokenSpendable > 0', async () => {
      const { status, body } = await api('GET', '/users/me', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.tokenSpendable).toBeGreaterThan(0);
    });

    it('3.25 tokenSpendable for alice', async () => {
      const { status, body } = await api('GET', '/users/me', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('tokenSpendable', 3.25);
    });

    it('guest has 0 tokenSpendable', async () => {
      const { status, body } = await api('GET', '/users/me', auth.guest.jwt);
      expect(status).toBe(200);
      expect(body.tokenSpendable).toBe(0);
    });

    it('guest can not create a scenario without spendable tokens (403)', async () => {
      const { status } = await api('POST', '/scenarios', auth.guest.jwt, {
        name: 'GuestScenario',
        systemMessage: 'you are a guest scenario',
        chatModelId,
      });
      expect(status).toBe(403);
    });

    it('guest has 0 scenarios', async () => {
      const { status, body } = await api('GET', '/scenarios', auth.guest.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('meta');
      expect(body.meta.total).toBe(0);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── Alice creates notWorking scenario ──────────────────────

    it('alice post a notWorking Scenario', async () => {
      const { status, body } = await api('POST', '/scenarios', auth.alice.jwt, {
        name: 'not working',
        systemMessage: 'you are not working',
        recommended: false,
        userGender: 'Male',
        avatarGender: 'Other',
        chatModelId,
        embeddingModelId,
        reasoningModelId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('name', 'not working');
      expect(body).toHaveProperty('systemMessage', 'you are not working');
      expect(body).toHaveProperty('recommended', false);
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('chatModelId', chatModelId);
      expect(body).toHaveProperty('embeddingModelId', embeddingModelId);
      expect(body).toHaveProperty('reasoningModelId', reasoningModelId);
      expect(body).toHaveProperty('userGender', 'Male');
      expect(body).toHaveProperty('avatarGender', 'Other');
      notWorkingScenarioId = body.id;
    });

    it('aliceUserProcessEvents contains >= 2 Events after notWorking create', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    // ─── Alice creates SmallTalk scenario ───────────────────────

    it('alice post a SmallTalk Scenario', async () => {
      const { status, body } = await api('POST', '/scenarios', auth.alice.jwt, {
        name: 'Small Talk',
        systemMessage: 'Engage in light, friendly conversation.',
        recommended: true,
        greeting: 'Hey! How is your day going?',
        userGender: 'Male',
        avatarGender: 'Female',
        chatModelId,
        embeddingModelId,
        reasoningModelId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('name', 'Small Talk');
      expect(body).toHaveProperty('recommended', true);
      expect(body).toHaveProperty('chatModelId', chatModelId);
      expect(body).toHaveProperty('embeddingModelId', embeddingModelId);
      expect(body).toHaveProperty('reasoningModelId', reasoningModelId);
      expect(body).toHaveProperty('type', 'NORMAL');
      smallTalkScenarioId = body.id;
    });

    it('aliceUserProcessEvents contains >= 2 Events after SmallTalk create', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    // ─── TTI: scenario picture from the derived scene ──────────────

    it('creating a scenario derives a scene and enqueues a picture job', async () => {
      // The processor calls the scenario's own chat model to distill a scene,
      // then enqueues a tti job — poll until it appears.
      let job: any = null;
      // Keep the deadline under bun's 30s per-test timeout. A loop that outlives
      // its test is not cancelled — it keeps polling and then asserts against a
      // job some *later* test created, which reports as an unrelated failure.
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline && !job) {
        const { body } = await api('GET', `/tti-jobs?scenarioId=${smallTalkScenarioId}`, auth.alice.jwt);
        job = (body.data ?? [])[0];
        if (!job) await new Promise((r) => setTimeout(r, 2000));
      }
      expect(job).toBeTruthy();
      // The scene is wrapped in the establishing-shot template.
      expect(job.prompt).toContain('establishing shot');
      expect(job.width).toBe(1216);
      expect(job.height).toBe(832);
    });

    it('manual scenario tti job with an explicit scene prompt', async () => {
      const { status, body } = await api('POST', '/tti-jobs', auth.alice.jwt, {
        scenarioId: smallTalkScenarioId,
        prompt: 'a sunlit rooftop garden overlooking the city at golden hour',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('scenarioId', smallTalkScenarioId);
      expect(body.avatarId).toBeNull();
      // No linked avatar → scene only (no character).
      expect(body.prompt).toContain('establishing shot');
      expect(body.prompt).toContain('sunlit rooftop garden');
    });

    it('a scenario with exactly one avatar puts the character in the scene', async () => {
      // Admin creates a published avatar with an appearance (bypasses the token
      // gate), then links it as the scenario's only avatar.
      const { body: voices } = await api('GET', '/tts-voices?limit=1', auth.admin.jwt);
      const voiceId = voices.data[0].id;
      const marker = 'long black hair, hazel eyes, teacher blazer';
      const { body: avatar } = await api('POST', '/avatars', auth.admin.jwt, {
        name: 'Scene Teacher', shortDesc: 'test', character: 'A calm teacher.',
        appearance: `woman with ${marker}`, ttsVoiceId: voiceId, published: true,
      });
      await api('PATCH', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt, { avatarIds: [avatar.id] });

      const { status, body } = await api('POST', '/tti-jobs', auth.alice.jwt, {
        scenarioId: smallTalkScenarioId,
        prompt: 'a quiet library reading room',
      });
      expect(status).toBe(200);
      // Character composition, with the avatar appearance woven into the scene.
      expect(body.prompt).toContain('environmental portrait');
      expect(body.prompt).toContain(marker);
      expect(body.prompt).toContain('quiet library reading room');

      // Clean up: describeScenarios() runs before describeAvatars(), and the
      // avatar tests assert exact counts over the documented fixture state
      // (hana + freya published, joi private). Leaving this published avatar
      // behind inflates every published/all=true count by one.
      const { status: deleted } = await api('DELETE', `/avatars/${avatar.id}`, auth.admin.jwt);
      expect(deleted).toBe(200);
    });

    it('bob can NOT generate a picture for alice\'s scenario (403)', async () => {
      const { status } = await api('POST', '/tti-jobs', auth.bob.jwt, {
        scenarioId: smallTalkScenarioId,
        prompt: 'hacked scene',
      });
      expect(status).toBe(403);
    });

    it('tti job with two targets is rejected (400)', async () => {
      const { status } = await api('POST', '/tti-jobs', auth.alice.jwt, {
        scenarioId: smallTalkScenarioId,
        avatarId: '00000000-0000-0000-0000-000000000000',
      });
      expect(status).toBe(400);
    });

    // ─── Get scenarios ─────────────────────────────────────────

    it('alice get the smallTalk Scenario', async () => {
      const { status, body } = await api('GET', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', smallTalkScenarioId);
      expect(body).toHaveProperty('recommended', true);
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('free', true);
      expect(Number(body.dollarPerMessage)).toBe(0);
    });

    it('alice get her 2 private scenarios', async () => {
      const { status, body } = await api('GET', '/scenarios', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(2);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(1);
      expect(body.data.length).toBe(2);
    });

    // ─── Update dollarPerMessage ────────────────────────────────

    it('alice updates SmallTalk dollarPerMessage to 0.02', async () => {
      const { status, body } = await api('PATCH', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt, {
        dollarPerMessage: 0.02,
      });
      expect(status).toBe(200);
      expect(Number(body.dollarPerMessage)).toBeCloseTo(0.02);
    });

    it('aliceUserProcessEvents contains >= 2 Events after dollarPerMessage change', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('SmallTalk is no longer free after dollarPerMessage change', async () => {
      const { status, body } = await api('GET', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('free', false);
      expect(Number(body.dollarPerMessage)).toBeCloseTo(0.02);
    });

    it('alice updates SmallTalk dollarPerMessage back to 0', async () => {
      const { status, body } = await api('PATCH', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt, {
        dollarPerMessage: 0,
      });
      expect(status).toBe(200);
      expect(Number(body.dollarPerMessage)).toBe(0);
    });

    it('aliceUserProcessEvents contains >= 2 Events after dollarPerMessage reset', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('SmallTalk is free again after dollarPerMessage reset to 0', async () => {
      const { status, body } = await api('GET', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('free', true);
      expect(Number(body.dollarPerMessage)).toBe(0);
    });

    // ─── Bob creates scenario ──────────────────────────────────

    it('should get the current tokenBalance of bob', async () => {
      const { status, body } = await api('GET', '/users/me', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(100);
      expect(body.tokenAllowance).toBe(2);
      expect(body.tokenSpendable).toBe(2);
    });

    it('bob post a DeepTalk Scenario', async () => {
      const greeting = 'Hello {user} my love. i can not wait to have sex with you.';
      const { status, body } = await api('POST', '/scenarios', auth.bob.jwt, {
        name: 'Deep Talk',
        type: 'ROLEPLAY',
        systemMessage: 'Explore philosophy and consciousness.',
        greeting,
        userGender: 'Male',
        avatarGender: 'Female',
        chatModelId,
        embeddingModelId,
        reasoningModelId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('recommended', false);
      expect(body).toHaveProperty('userGender', 'Male');
      expect(body).toHaveProperty('avatarGender', 'Female');
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('greeting', greeting);
      expect(body).toHaveProperty('type', 'ROLEPLAY');
      bobDeepTalkScenarioId = body.id;
    });

    it('bobUserProcessEvents contains >= 2 Events after DeepTalk create', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(bobUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      bobUserProcessEvents = [];
    });

    it('bob get 1 private scenario', async () => {
      const { status, body } = await api('GET', '/scenarios', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(1);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(1);
      expect(body.data.length).toBe(1);
    });

    it('bob get the deepTalk Scenario', async () => {
      const { status, body } = await api('GET', `/scenarios/${bobDeepTalkScenarioId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', bobDeepTalkScenarioId);
      expect(body).toHaveProperty('published', false);
      expect(body).toHaveProperty('free', true);
      expect(body).toHaveProperty('userGender', 'Male');
      expect(body).toHaveProperty('avatarGender', 'Female');
    });

    // ─── Admin all=true ────────────────────────────────────────

    it('admin -> all=true returns every scenario (incl. private of other users)', async () => {
      const { status, body } = await api('GET', '/scenarios?all=true', auth.admin.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(3);
      const ids = body.data.map((s: any) => s.id);
      expect(ids).toContain(bobDeepTalkScenarioId);
      expect(ids).toContain(smallTalkScenarioId);
    });

    it('alice -> all=true is ignored for non-admin (own + published only)', async () => {
      const { status, body } = await api('GET', '/scenarios?all=true', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(2);
      const ids = body.data.map((s: any) => s.id);
      expect(ids).not.toContain(bobDeepTalkScenarioId);
    });

    // ─── Cross-user access ─────────────────────────────────────

    it('alice dont get the private bobDeepTalkScenario', async () => {
      const { status } = await api('GET', `/scenarios/${bobDeepTalkScenarioId}`, auth.alice.jwt);
      expect(status).toBe(403);
    });

    it('anonymous dont get the private bobDeepTalkScenario', async () => {
      const { status } = await get(`/scenarios/${bobDeepTalkScenarioId}`);
      expect(status).toBe(403);
    });

    it('bob get the private bobDeepTalkScenario', async () => {
      const { status, body } = await api('GET', `/scenarios/${bobDeepTalkScenarioId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', bobDeepTalkScenarioId);
    });

    it('bob can not delete aliceSmallTalkScenario', async () => {
      const { status } = await api('DELETE', `/scenarios/${smallTalkScenarioId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    // ─── Publish scenario ──────────────────────────────────────

    it('bob can update bobDeepTalkScenario to published', async () => {
      const { status, body } = await api('PATCH', `/scenarios/${bobDeepTalkScenarioId}`, auth.bob.jwt, {
        published: true,
        userGender: null,
        reasoningModelId: null,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('published', true);
      expect(body).toHaveProperty('userGender', null);
      expect(body).toHaveProperty('reasoningModelId', null);
    });

    it('bobUserProcessEvents contains >= 2 Events after publish', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(bobUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      bobUserProcessEvents = [];
    });

    it('bob can not delete his published bobDeepTalkScenario', async () => {
      const { status } = await api('DELETE', `/scenarios/${bobDeepTalkScenarioId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    it('alice get the published bobDeepTalkScenario', async () => {
      const { status, body } = await api('GET', `/scenarios/${bobDeepTalkScenarioId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', bobDeepTalkScenarioId);
      expect(body).toHaveProperty('published', true);
      expect(body).toHaveProperty('free', true);
    });

    it('anonymous get the published bobDeepTalkScenario', async () => {
      const { status, body } = await get(`/scenarios/${bobDeepTalkScenarioId}`);
      expect(status).toBe(200);
      expect(body).toHaveProperty('published', true);
      expect(body).toHaveProperty('free', true);
    });

    // ─── Scenario counts after publish ─────────────────────────

    it('alice get 3 scenarios (own SmallTalk + notWorking + published bob) default view', async () => {
      const { status, body } = await api('GET', '/scenarios', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(3);
      expect(body.data.length).toBe(3);
    });

    it('alice get 1 published scenario', async () => {
      const { status, body } = await api('GET', '/scenarios?published=true', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(1);
      expect(body.data.length).toBe(1);
    });

    // ─── Filters ───────────────────────────────────────────────

    it('alice filters scenarios by name', async () => {
      const { status, body } = await api('GET', '/scenarios?name=deep&published=true', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty('name', 'Deep Talk');
      expect(body.data[0]).toHaveProperty('published', true);
    });

    it('bob filters scenarios by name', async () => {
      const { status, body } = await api('GET', '/scenarios?name=deep&published=true', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty('name', 'Deep Talk');
    });

    it('anonymous filters scenarios by name', async () => {
      const { status, body } = await get('/scenarios?name=deep&published=true');
      expect(status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty('name', 'Deep Talk');
      expect(body.data[0]).toHaveProperty('published', true);
    });

    // ─── NSFW ──────────────────────────────────────────────────

    it('bob can update bobDeepTalkScenario to nsfw', async () => {
      const { status, body } = await api('PATCH', `/scenarios/${bobDeepTalkScenarioId}`, auth.bob.jwt, {
        nsfw: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('nsfw', true);
      expect(body).toHaveProperty('published', true);
    });

    it('bobUserProcessEvents contains >= 2 Events after nsfw update', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(bobUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      bobUserProcessEvents = [];
    });

    it('bob filter scenarios by nsfw', async () => {
      const { status, body } = await api('GET', '/scenarios?nsfw=true', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(1);
      expect(body.data.length).toBe(1);
    });

    // ─── Sponsorship-related free flag ─────────────────────────

    it('alice post a Sponsorship for bobDeepTalkScenario', async () => {
      const { status, body } = await api('POST', '/sponsorships', auth.alice.jwt, {
        scenarioId: bobDeepTalkScenarioId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('scenarioId', bobDeepTalkScenarioId);
      expect(body).toHaveProperty('userId', auth.alice.userId);
    });

    it('get sponsorship by scenarioId as alice', async () => {
      const { status, body } = await api('GET', `/sponsorships?scenarioId=${bobDeepTalkScenarioId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    it('bob filter scenarios by hasSponsorship', async () => {
      const { status, body } = await api('GET', '/scenarios?published=true&nsfw=true&hasSponsorship=true', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    it('get 3 scenarios as alice (own SmallTalk + notWorking + published bob)', async () => {
      const { status, body } = await api('GET', '/scenarios', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(3);
      expect(body.data.length).toBe(3);
    });

    it('get 1 sponsorship via alice', async () => {
      const { status, body } = await api('GET', '/sponsorships', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    it('alice deletes her sponsorship', async () => {
      const { body: sponsorships } = await api('GET', '/sponsorships', auth.alice.jwt);
      const sponsorship = sponsorships.data[0];
      const { status } = await api('DELETE', `/sponsorships/${sponsorship.id}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('get 0 sponsorships via alice after delete', async () => {
      const { status, body } = await api('GET', '/sponsorships', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    // ─── Delete scenarios ──────────────────────────────────────

    it('delete notWorkingScenario as alice', async () => {
      const { status } = await api('DELETE', `/scenarios/${notWorkingScenarioId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('aliceUserProcessEvents contains >= 2 Events after delete', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('get no sponsorship by scenarioId after delete', async () => {
      const { status, body } = await api('GET', '/sponsorships', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    it('alice get 1 scenario after delete', async () => {
      const { status, body } = await api('GET', '/scenarios?mine=true', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    it('alice get 2 scenarios after delete (own SmallTalk + published bob)', async () => {
      const { status, body } = await api('GET', '/scenarios', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(2);
      expect(body.data.length).toBe(2);
    });

    it('bob get 1 published scenario', async () => {
      const { status, body } = await api('GET', '/scenarios?nsfw=true', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    it('alice cannot delete her own published scenario', async () => {
      // Find a published scenario owned by alice
      const { body: scenarios } = await api('GET', '/scenarios?mine=true', auth.alice.jwt);
      const published = scenarios.data.find((s: any) => s.published);
      if (published) {
        const { status } = await api('DELETE', `/scenarios/${published.id}`, auth.alice.jwt);
        expect(status).toBe(403);
      }
    });

    // ─── Model clearing (set embeddingModelId/reasoningModelId to null) ─

    it('alice post a scenario without embedding and reasoning models', async () => {
      const { status, body } = await api('POST', '/scenarios', auth.alice.jwt, {
        name: 'No Models Test',
        systemMessage: 'you are a simple chatbot without embedding or reasoning',
        recommended: false,
        userGender: 'Male',
        avatarGender: 'Female',
        chatModelId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('chatModelId', chatModelId);
      expect(body).toHaveProperty('embeddingModelId', null);
      expect(body).toHaveProperty('reasoningModelId', null);
      expect(body).toHaveProperty('published', false);
    });

    it('aliceUserProcessEvents contains >= 2 Events after creating scenario without models', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('SmallTalk has non-null embeddingModelId before clearing', async () => {
      const { status, body } = await api('GET', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.embeddingModelId).not.toBeNull();
    });

    it('alice update scenario to clear embedding and reasoning models', async () => {
      const { status, body } = await api('PATCH', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt, {
        embeddingModelId: null,
        reasoningModelId: null,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', smallTalkScenarioId);
      expect(body).toHaveProperty('embeddingModelId', null);
      expect(body).toHaveProperty('reasoningModelId', null);
      expect(body).toHaveProperty('chatModelId', chatModelId);
    });

    it('aliceUserProcessEvents contains >= 2 Events after clearing models', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('alice restores embedding and reasoning models on SmallTalk', async () => {
      const { status, body } = await api('PATCH', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt, {
        embeddingModelId,
        reasoningModelId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('embeddingModelId', embeddingModelId);
      expect(body).toHaveProperty('reasoningModelId', reasoningModelId);
    });

    it('aliceUserProcessEvents contains >= 2 Events after restoring models', async () => {
      await waitForQueuesEmpty(60000);
      expect(aliceUserProcessEvents.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    // ─── Type change disconnects models ─────────────────────────

    it('SmallTalk has models connected before type change', async () => {
      const { status, body } = await api('GET', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('embeddingModelId', embeddingModelId);
      expect(body).toHaveProperty('reasoningModelId', reasoningModelId);
      expect(body).toHaveProperty('type', 'NORMAL');
    });

    it('alice switches SmallTalk from NORMAL to ROLEPLAY and models are disconnected', async () => {
      const { status, body } = await api('PATCH', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt, {
        type: 'ROLEPLAY',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('type', 'ROLEPLAY');
      expect(body).toHaveProperty('embeddingModelId', null);
      expect(body).toHaveProperty('reasoningModelId', null);
      expect(body).toHaveProperty('chatModelId', chatModelId);
    });

    it('aliceUserProcessEvents contains >= 2 Events after type change', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('alice switches SmallTalk back to NORMAL', async () => {
      const { status, body } = await api('PATCH', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt, {
        type: 'NORMAL',
        embeddingModelId,
        reasoningModelId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('type', 'NORMAL');
      expect(body).toHaveProperty('embeddingModelId', embeddingModelId);
      expect(body).toHaveProperty('reasoningModelId', reasoningModelId);
    });

    it('aliceUserProcessEvents contains >= 2 Events after type restore', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    // ─── ROLEPLAY alien scenario ───────────────────────────────

    it('alice creates a ROLEPLAY alien scenario', async () => {
      const { status, body } = await api('POST', '/scenarios', auth.alice.jwt, {
        name: 'Alien Believer',
        type: 'ROLEPLAY',
        systemMessage: 'You are a passionate alien believer who tries to convince the user that aliens are among us.',
        greeting: 'Did you see those lights in the sky last night?',
        userGender: 'Male',
        avatarGender: 'Female',
        chatModelId,
        embeddingModelId,
        reasoningModelId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('name', 'Alien Believer');
      expect(body).toHaveProperty('type', 'ROLEPLAY');
      expect(body).toHaveProperty('userGender', 'Male');
      expect(body).toHaveProperty('avatarGender', 'Female');
      expect(body).toHaveProperty('published', false);
    });

    it('aliceUserProcessEvents contains >= 2 Events after alien scenario create', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('alice finds her alien scenario by name filter', async () => {
      const { status, body } = await api('GET', '/scenarios?name=Alien', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data[0]).toHaveProperty('name', 'Alien Believer');
      expect(body.data[0]).toHaveProperty('type', 'ROLEPLAY');
      expect(body.data[0]).toHaveProperty('free', true);
      expect(body.data[0]).toHaveProperty('userGender', 'Male');
      expect(body.data[0]).toHaveProperty('avatarGender', 'Female');
    });

    // ─── Avatar assignment on scenario create & patch ───────────

    let avatarForScenarioId: string;

    it('alice creates an avatar for scenario-avatar tests', async () => {
      const { status, body } = await api('POST', '/avatars', auth.alice.jwt, {
        name: 'ScenarioTestAvatar',
        shortDesc: 'Avatar for scenario tests',
        character: 'Helpful test avatar',
        ttsVoiceId: heartVoiceId,
        gender: 'Female',
      });
      expect(status).toBe(200);
      avatarForScenarioId = body.id;
    });

    it('alice creates a scenario with avatarIds', async () => {
      const { status, body } = await api('POST', '/scenarios', auth.alice.jwt, {
        name: 'Avatar Linked Scenario',
        systemMessage: 'scenario with avatar',
        chatModelId,
        avatarIds: [avatarForScenarioId],
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('name', 'Avatar Linked Scenario');
      expect(body.avatars).toHaveLength(1);
      expect(body.avatars[0]).toHaveProperty('id', avatarForScenarioId);
    });

    it('aliceUserProcessEvents contains >= 2 Events after avatar-linked scenario create', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const scenarios = processEvents.Scenario || [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('alice patches SmallTalk scenario to add avatar via avatarIds', async () => {
      const { status, body } = await api('PATCH', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt, {
        avatarIds: [avatarForScenarioId],
      });
      expect(status).toBe(200);
      expect(body.avatars).toHaveLength(1);
      expect(body.avatars[0]).toHaveProperty('id', avatarForScenarioId);
    });

    it('no Scenario reprocessing after avatar patch (relation, not scalar) but a picture regenerates', async () => {
      await waitForQueuesEmpty(60000);
      // avatarIds is a relation → no Scenario scalar reprocessing…
      // avatarIds is a relation → no Scenario scalar reprocessing. (The membership
      // change still regenerates the picture — covered by the character-in-scene
      // test — but that runs through the tti queue, not a Scenario event.)
      expect((groupByResourceName(aliceUserProcessEvents).Scenario || []).length).toBe(0);
      aliceUserProcessEvents = [];
    });

    it('alice patches SmallTalk scenario to remove all avatars', async () => {
      const { status, body } = await api('PATCH', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt, {
        avatarIds: [],
      });
      expect(status).toBe(200);
      expect(body.avatars).toHaveLength(0);
    });

    it('no Scenario reprocessing after avatar removal (relation, not scalar) but a picture regenerates', async () => {
      await waitForQueuesEmpty(60000);
      expect((groupByResourceName(aliceUserProcessEvents).Scenario || []).length).toBe(0);
      aliceUserProcessEvents = [];
    });

    it('alice re-adds avatar to SmallTalk scenario', async () => {
      const { status, body } = await api('PATCH', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt, {
        avatarIds: [avatarForScenarioId],
      });
      expect(status).toBe(200);
      expect(body.avatars).toHaveLength(1);
      expect(body.avatars[0]).toHaveProperty('id', avatarForScenarioId);
    });

    it('no Scenario reprocessing after avatar re-add (relation, not scalar) but a picture regenerates', async () => {
      await waitForQueuesEmpty(60000);
      expect((groupByResourceName(aliceUserProcessEvents).Scenario || []).length).toBe(0);
      aliceUserProcessEvents = [];
    });

    it('GET scenario by id returns avatars', async () => {
      const { status, body } = await api('GET', `/scenarios/${smallTalkScenarioId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.avatars).toHaveLength(1);
      expect(body.avatars[0]).toHaveProperty('id', avatarForScenarioId);
    });

    // ─── Guest still can't create ──────────────────────────────

    it('guest still can not create a scenario without spendable tokens (403)', async () => {
      const { status } = await api('POST', '/scenarios', auth.guest.jwt, {
        name: 'GuestScenarioAgain',
        systemMessage: 'you are a guest scenario',
        chatModelId,
        embeddingModelId,
        reasoningModelId,
      });
      expect(status).toBe(403);
    });

    it('guest sees published scenarios only (no own)', async () => {
      const { status, body } = await api('GET', '/scenarios?mine=true', auth.guest.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    // ─── Cleanup avatar created for scenario-avatar tests ─────

    it('alice deletes the ScenarioTestAvatar', async () => {
      const { status } = await api('DELETE', `/avatars/${avatarForScenarioId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('aliceUserProcessEvents contains >= 1 Events after avatar cleanup', async () => {
      await waitForQueuesEmpty(60000);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const avatars = processEvents.Avatar || [];
      expect(avatars.length).toBeGreaterThanOrEqual(1);
      aliceUserProcessEvents = [];
    });

    // ─── Cleanup MQTT ──────────────────────────────────────────

    it('no unprocessed events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      if (aliceUserProcessEvents.length > 0) console.log('Unprocessed alice user events:', aliceUserProcessEvents.length, aliceUserProcessEvents);
      if (bobUserProcessEvents.length > 0) console.log('Unprocessed bob user events:', bobUserProcessEvents.length, bobUserProcessEvents);
      expect(aliceUserProcessEvents.length).toBe(0);
      expect(bobUserProcessEvents.length).toBe(0);
    });

    it('disconnect alice MQTT client', async () => {
      aliceMqttClient.end();
    });

    it('disconnect bob MQTT client', async () => {
      bobMqttClient.end();
    });

  });
}
