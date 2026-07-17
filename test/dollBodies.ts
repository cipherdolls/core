
import { auth, api, get } from './helpers';

export let dollBodyId: string;

export function describeDollBodies() {
  describe('Doll Bodies', () => {

    let hanaAvatarId: string;
    let hanaOwnerId: string;

    // ─── Setup: fetch avatar ───────────────────────────────────

    it('fetch hana avatar for doll body tests', async () => {
      const { body } = await api('GET', '/avatars', auth.alice.jwt);
      const hana = body.data.find((a: any) => a.name === 'Hana');
      expect(hana).toBeDefined();
      hanaAvatarId = hana.id;
      hanaOwnerId = hana.userId;
    });

    // ─── Empty state ───────────────────────────────────────────

    it('get dollBodies as alice (0)', async () => {
      const { status, body } = await api('GET', '/doll-bodies', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── Alice cannot create ───────────────────────────────────

    it('alice can not post a DollBody', async () => {
      const { status } = await api('POST', '/doll-bodies', auth.alice.jwt, {
        name: 'SenseCAP Watcher',
        description: 'ESP32-S3 AI sensor with camera, mic, speaker',
        avatarId: hanaAvatarId,
      });
      expect(status).toBe(403);
    });

    // ─── Admin creates doll body ───────────────────────────────

    it('admin post a SenseCAP Watcher Doll Body', async () => {
      const { status, body } = await api('POST', '/doll-bodies', auth.admin.jwt, {
        name: 'SenseCAP Watcher',
        description: 'ESP32-S3 AI sensor with camera, mic, speaker',
        avatarId: hanaAvatarId,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'SenseCAP Watcher');
      expect(body).toHaveProperty('description', 'ESP32-S3 AI sensor with camera, mic, speaker');
      expect(body).toHaveProperty('avatarId', hanaAvatarId);
      // Owner is the avatar's creator (alice), not the admin who created it.
      expect(body).toHaveProperty('userId', hanaOwnerId);
      dollBodyId = body.id;
    });

    // ─── Alice cannot update ───────────────────────────────────

    it('can not update smartWig as alice', async () => {
      const { status } = await api('PATCH', `/doll-bodies/${dollBodyId}`, auth.alice.jwt, {
        name: 'SenseCAP-Watcher',
      });
      expect(status).toBe(403);
    });

    // ─── Admin updates doll body ───────────────────────────────

    it('updates dollBody name via admin', async () => {
      const { status, body } = await api('PATCH', `/doll-bodies/${dollBodyId}`, auth.admin.jwt, {
        name: 'SenseCAP-Watcher',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('name', 'SenseCAP-Watcher');
    });

    // ─── Read doll body ────────────────────────────────────────

    it('get SenseCAP-Watcher as bob', async () => {
      const { status, body } = await api('GET', `/doll-bodies/${dollBodyId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('name', 'SenseCAP-Watcher');
    });

    // ─── Alice cannot delete ───────────────────────────────────

    it('alice can not delete smartWig', async () => {
      const { status } = await api('DELETE', `/doll-bodies/${dollBodyId}`, auth.alice.jwt);
      expect(status).toBe(403);
    });

    it('get dollBodies as alice (1)', async () => {
      const { status, body } = await api('GET', '/doll-bodies', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
    });

    // ─── Validation (400) ──────────────────────────────────────

    it('POST /doll-bodies with empty body as admin returns 422', async () => {
      const { status } = await api('POST', '/doll-bodies', auth.admin.jwt, {});
      expect(status).toBe(422);
    });

    it('POST /doll-bodies with missing name returns 422', async () => {
      const { status } = await api('POST', '/doll-bodies', auth.admin.jwt, {
        description: 'test',
        avatarId: hanaAvatarId,
      });
      expect(status).toBe(422);
    });

    it('POST /doll-bodies with missing description returns 422', async () => {
      const { status } = await api('POST', '/doll-bodies', auth.admin.jwt, {
        name: 'test',
        avatarId: hanaAvatarId,
      });
      expect(status).toBe(422);
    });

    it('POST /doll-bodies with missing avatarId returns 422', async () => {
      const { status } = await api('POST', '/doll-bodies', auth.admin.jwt, {
        name: 'test',
        description: 'test',
      });
      expect(status).toBe(422);
    });

    it('POST /doll-bodies with invalid avatarId (not UUID) returns 422', async () => {
      const { status } = await api('POST', '/doll-bodies', auth.admin.jwt, {
        name: 'test',
        description: 'test',
        avatarId: 'not-a-uuid',
      });
      expect(status).toBe(422);
    });

    // ─── Non-existent resources ────────────────────────────────

    it('POST /doll-bodies with non-existent avatarId returns 404', async () => {
      const { status } = await api('POST', '/doll-bodies', auth.admin.jwt, {
        name: 'test',
        description: 'test',
        avatarId: '00000000-0000-0000-0000-000000000000',
      });
      expect(status).toBe(404);
    });

    it('GET /doll-bodies/:nonExistentId returns 404', async () => {
      const { status } = await api('GET', '/doll-bodies/00000000-0000-0000-0000-000000000000', auth.alice.jwt);
      expect(status).toBe(404);
    });

    it('PATCH /doll-bodies/:nonExistentId as admin returns 404', async () => {
      const { status } = await api('PATCH', '/doll-bodies/00000000-0000-0000-0000-000000000000', auth.admin.jwt, {
        name: 'test',
        description: 'test',
        avatarId: hanaAvatarId,
      });
      expect(status).toBe(404);
    });

    it('DELETE /doll-bodies/:nonExistentId as admin returns 404', async () => {
      const { status } = await api('DELETE', '/doll-bodies/00000000-0000-0000-0000-000000000000', auth.admin.jwt);
      expect(status).toBe(404);
    });

    // ─── Non-admin access ──────────────────────────────────────

    it('bob can NOT create a DollBody (403)', async () => {
      const { status } = await api('POST', '/doll-bodies', auth.bob.jwt, {
        name: 'test',
        description: 'test',
        avatarId: hanaAvatarId,
      });
      expect(status).toBe(403);
    });

    it('bob can NOT update smartWig (403)', async () => {
      const { status } = await api('PATCH', `/doll-bodies/${dollBodyId}`, auth.bob.jwt, {
        name: 'hacked',
        description: 'hacked',
        avatarId: hanaAvatarId,
      });
      expect(status).toBe(403);
    });

    it('bob can NOT delete smartWig (403)', async () => {
      const { status } = await api('DELETE', `/doll-bodies/${dollBodyId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    // ─── Unauthenticated requests ──────────────────────────────

    it('GET /doll-bodies without auth returns 401', async () => {
      const { status } = await get('/doll-bodies');
      expect(status).toBe(401);
    });

    it('POST /doll-bodies without auth returns 401', async () => {
      const res = await fetch(`${process.env.BASE_URL ?? 'http://localhost:4000'}/doll-bodies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test', description: 'test', avatarId: hanaAvatarId }),
      });
      expect(res.status).toBe(401);
    });

    it('PATCH /doll-bodies/:id without auth returns 401', async () => {
      const res = await fetch(`${process.env.BASE_URL ?? 'http://localhost:4000'}/doll-bodies/${dollBodyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      });
      expect(res.status).toBe(401);
    });

    it('DELETE /doll-bodies/:id without auth returns 401', async () => {
      const res = await fetch(`${process.env.BASE_URL ?? 'http://localhost:4000'}/doll-bodies/${dollBodyId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });

    // ─── Virtual doll bodies (appearance carrier for TTI) ──────

    let virtualBodyId: string;

    it('alice creates a virtual DollBody for her avatar Hana', async () => {
      const { status, body } = await api('POST', '/doll-bodies', auth.alice.jwt, {
        name: 'Hana virtual body',
        description: 'Virtual body used for image generation',
        avatarId: hanaAvatarId,
        virtual: true,
        appearance: 'young woman with long black hair, brown eyes, warm smile',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('virtual', true);
      expect(body).toHaveProperty('appearance', 'young woman with long black hair, brown eyes, warm smile');
      virtualBodyId = body.id;
    });

    it('bob can NOT create a virtual DollBody for alice\'s avatar (403)', async () => {
      const { status } = await api('POST', '/doll-bodies', auth.bob.jwt, {
        name: 'intruder body',
        description: 'test',
        avatarId: hanaAvatarId,
        virtual: true,
      });
      expect(status).toBe(403);
    });

    it('alice updates her virtual body appearance', async () => {
      const { status, body } = await api('PATCH', `/doll-bodies/${virtualBodyId}`, auth.alice.jwt, {
        appearance: 'young woman with long black hair, hazel eyes, gentle smile',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('appearance', 'young woman with long black hair, hazel eyes, gentle smile');
    });

    it('bob can NOT update alice\'s virtual body (403)', async () => {
      const { status } = await api('PATCH', `/doll-bodies/${virtualBodyId}`, auth.bob.jwt, {
        appearance: 'hacked',
      });
      expect(status).toBe(403);
    });

    it('filters doll bodies by avatarId and virtual', async () => {
      const { status, body } = await api('GET', `/doll-bodies?avatarId=${hanaAvatarId}&virtual=true`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
      expect(body.data[0]).toHaveProperty('id', virtualBodyId);
    });

    // ─── Picture gallery (doll bodies keep many pictures) ──────

    const uploadBodyPicture = async (jwt: string, bodyId: string) => {
      // Minimal valid 1x1 PNG
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      const formData = new FormData();
      formData.append('file', new File([png], 'gen.png', { type: 'image/png' }));
      formData.append('dollBodyId', bodyId);
      const res = await fetch(`${process.env.BASE_URL ?? 'http://localhost:4000'}/pictures`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
        body: formData,
      });
      return { status: res.status, body: await res.json() };
    };

    it('uploads accumulate as a gallery on a doll body', async () => {
      const first = await uploadBodyPicture(auth.alice.jwt, virtualBodyId);
      expect(first.status).toBe(200);
      const second = await uploadBodyPicture(auth.alice.jwt, virtualBodyId);
      expect(second.status).toBe(200);
      expect(second.body.id).not.toBe(first.body.id);

      const { status, body } = await api('GET', `/doll-bodies/${virtualBodyId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.pictures.length).toBe(2);
      // Newest first — the latest generation is the cover.
      expect(body.pictures[0].id).toBe(second.body.id);
    });

    // ─── TTI jobs (image generation for a doll body) ───────────

    it('alice creates a tti job for her virtual body', async () => {
      const { status, body } = await api('POST', '/tti-jobs', auth.alice.jwt, {
        dollBodyId: virtualBodyId,
        prompt: 'sitting in a sunlit cafe',
        seed: 42,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      // Final prompt combines the body appearance with the extra prompt.
      expect(body.prompt).toContain('black hair');
      expect(body.prompt).toContain('sunlit cafe');
      expect(body).toHaveProperty('seed', 42);
      expect(body).toHaveProperty('dollBodyId', virtualBodyId);
    });

    it('bob can NOT create a tti job for alice\'s body (403)', async () => {
      const { status } = await api('POST', '/tti-jobs', auth.bob.jwt, { dollBodyId: virtualBodyId });
      expect(status).toBe(403);
    });

    it('tti job for non-existent body returns 404', async () => {
      const { status } = await api('POST', '/tti-jobs', auth.alice.jwt, {
        dollBodyId: '00000000-0000-0000-0000-000000000000',
      });
      expect(status).toBe(404);
    });

    it('tti job on a body without appearance requires a prompt (400)', async () => {
      // The physical SenseCAP body has no appearance set.
      const { status } = await api('POST', '/tti-jobs', auth.alice.jwt, { dollBodyId });
      expect(status).toBe(400);
    });

    it('alice lists her tti jobs, bob sees none', async () => {
      const alice = await api('GET', `/tti-jobs?dollBodyId=${virtualBodyId}`, auth.alice.jwt);
      expect(alice.status).toBe(200);
      // At least the manually created job (appearance updates may auto-add more).
      expect(alice.body.data.length).toBeGreaterThanOrEqual(1);
      expect(alice.body.data.some((j: any) => j.prompt.includes('sunlit cafe'))).toBe(true);
      const bob = await api('GET', '/tti-jobs', auth.bob.jwt);
      expect(bob.status).toBe(200);
      expect(bob.body.data.length).toBe(0);
    });

    it('updating the appearance auto-creates a tti job (regenerates pictures)', async () => {
      const marker = 'vivid emerald streaks in her hair';
      const { status } = await api('PATCH', `/doll-bodies/${virtualBodyId}`, auth.alice.jwt, {
        appearance: `young woman with long black hair, ${marker}`,
      });
      expect(status).toBe(200);

      // The dollBody processor reacts to the appearance change and enqueues a
      // TTI job — poll until it shows up.
      let autoJob: any = null;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && !autoJob) {
        const { body } = await api('GET', `/tti-jobs?dollBodyId=${virtualBodyId}`, auth.alice.jwt);
        autoJob = (body.data ?? []).find((j: any) => j.prompt.includes(marker));
        if (!autoJob) await new Promise((r) => setTimeout(r, 1000));
      }
      expect(autoJob).toBeTruthy();
      expect(autoJob.userId).toBeDefined();
    });

    it('creating a body with an appearance auto-creates its first tti job', async () => {
      const marker = 'silver bob haircut and amber eyes';
      const { status, body } = await api('POST', '/doll-bodies', auth.alice.jwt, {
        name: 'Hana alternate body',
        description: 'Second virtual body',
        avatarId: hanaAvatarId,
        virtual: true,
        appearance: `petite woman with a ${marker}`,
      });
      expect(status).toBe(200);

      let autoJob: any = null;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && !autoJob) {
        const { body: jobs } = await api('GET', `/tti-jobs?dollBodyId=${body.id}`, auth.alice.jwt);
        autoJob = (jobs.data ?? []).find((j: any) => j.prompt.includes(marker));
        if (!autoJob) await new Promise((r) => setTimeout(r, 1000));
      }
      expect(autoJob).toBeTruthy();

      // Cleanup — jobs cascade with the body.
      const del = await api('DELETE', `/doll-bodies/${body.id}`, auth.alice.jwt);
      expect(del.status).toBe(200);
    });

    // ─── TTI styles (admin-curated prompt templates) ───────────

    let styleId: string;

    it('alice can NOT create a tti style (403)', async () => {
      const { status } = await api('POST', '/tti-styles', auth.alice.jwt, {
        name: 'Hack', template: 'x {subject} y',
      });
      expect(status).toBe(403);
    });

    it('template without {subject} is rejected (400)', async () => {
      const { status } = await api('POST', '/tti-styles', auth.admin.jwt, {
        name: 'Broken', template: 'no placeholder here',
      });
      expect(status).toBe(400);
    });

    it('admin creates a published tti style with composition directives', async () => {
      const { status, body } = await api('POST', '/tti-styles', auth.admin.jwt, {
        name: 'Neon Test',
        template: 'neon portrait of {subject}, head and shoulders centered, eyes at the vertical center of the frame',
        width: 1024,
        height: 1024,
        published: true,
        recommended: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('width', 1024);
      styleId = body.id;
    });

    it('unpublished styles are hidden from non-admins', async () => {
      const draft = await api('POST', '/tti-styles', auth.admin.jwt, {
        name: 'Draft', template: 'draft {subject}',
      });
      expect(draft.status).toBe(200);
      const list = await api('GET', '/tti-styles', auth.alice.jwt);
      expect(list.body.data.some((s: any) => s.id === draft.body.id)).toBe(false);
      expect(list.body.data.some((s: any) => s.id === styleId)).toBe(true);
      await api('DELETE', `/tti-styles/${draft.body.id}`, auth.admin.jwt);
    });

    it('setting the body style regenerates with the style template and size', async () => {
      const { status } = await api('PATCH', `/doll-bodies/${virtualBodyId}`, auth.alice.jwt, {
        ttiStyleId: styleId,
      });
      expect(status).toBe(200);

      let styleJob: any = null;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && !styleJob) {
        const { body } = await api('GET', `/tti-jobs?dollBodyId=${virtualBodyId}`, auth.alice.jwt);
        styleJob = (body.data ?? []).find((j: any) => j.ttiStyleId === styleId);
        if (!styleJob) await new Promise((r) => setTimeout(r, 1000));
      }
      expect(styleJob).toBeTruthy();
      expect(styleJob.prompt).toContain('neon portrait of');
      expect(styleJob.prompt).toContain('eyes at the vertical center');
      expect(styleJob.width).toBe(1024);
      expect(styleJob.height).toBe(1024);
    });

    it('manual tti job uses the body\'s style by default', async () => {
      const { status, body } = await api('POST', '/tti-jobs', auth.alice.jwt, {
        dollBodyId: virtualBodyId,
        prompt: 'holding a coffee cup',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('ttiStyleId', styleId);
      expect(body.prompt).toContain('neon portrait of');
      expect(body.prompt).toContain('holding a coffee cup');
      expect(body.width).toBe(1024);
    });

    it('bob can NOT delete alice\'s virtual body (403)', async () => {
      const { status } = await api('DELETE', `/doll-bodies/${virtualBodyId}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    it('alice deletes her virtual body', async () => {
      const { status } = await api('DELETE', `/doll-bodies/${virtualBodyId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    // ─── Final check ───────────────────────────────────────────

    it('smartWig still exists with correct data', async () => {
      const { status, body } = await api('GET', `/doll-bodies/${dollBodyId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('name', 'SenseCAP-Watcher');
      expect(body).toHaveProperty('avatarId', hanaAvatarId);
    });
  });
}
