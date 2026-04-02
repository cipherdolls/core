
import { auth, api, get } from './helpers';

export let dollBodyId: string;

export function describeDollBodies() {
  describe('Doll Bodies', () => {

    let hanaAvatarId: string;

    // ─── Setup: fetch avatar ───────────────────────────────────

    it('fetch hana avatar for doll body tests', async () => {
      const { body } = await api('GET', '/avatars', auth.alice.jwt);
      const hana = body.data.find((a: any) => a.name === 'Hana');
      expect(hana).toBeDefined();
      hanaAvatarId = hana.id;
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

    it('POST /doll-bodies with non-existent avatarId returns 500', async () => {
      const { status } = await api('POST', '/doll-bodies', auth.admin.jwt, {
        name: 'test',
        description: 'test',
        avatarId: '00000000-0000-0000-0000-000000000000',
      });
      expect(status).toBe(500);
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

    // ─── Final check ───────────────────────────────────────────

    it('smartWig still exists with correct data', async () => {
      const { status, body } = await api('GET', `/doll-bodies/${dollBodyId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('name', 'SenseCAP-Watcher');
      expect(body).toHaveProperty('avatarId', hanaAvatarId);
    });
  });
}
