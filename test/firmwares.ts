
import { auth, api, get } from './helpers';

export let firmwareId: string;

export function describeFirmwares() {
  describe('Firmwares', () => {

    let dollBodyId: string;

    // ─── Setup: fetch doll body ────────────────────────────────

    it('fetch doll body for firmware tests', async () => {
      const { body } = await api('GET', '/doll-bodies', auth.alice.jwt);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      dollBodyId = body.data[0].id;
    });

    // ─── Empty state ───────────────────────────────────────────

    it('get firmwares as alice (0)', async () => {
      const { status, body } = await api('GET', '/firmwares', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── Admin creates firmware (skip file upload) ─────────────
    // NOTE: File upload tests are skipped as they require multipart form data
    // which is not easily handled with the api() helper.

    // ─── Read tests (depend on firmware existing) ──────────────
    // These tests will work once firmwares are seeded or created via another mechanism.

    it('alice cannot create firmware (403)', async () => {
      const { status } = await api('POST', '/firmwares', auth.alice.jwt, {
        version: 'test-version',
        dollBodyId,
        bin: 'https://example.com/firmware.bin',
        checksum: 'abc123',
      });
      expect(status).toBe(403);
    });

    it('bob cannot create firmware (403)', async () => {
      const { status } = await api('POST', '/firmwares', auth.bob.jwt, {
        version: 'test-version',
        dollBodyId,
        bin: 'https://example.com/firmware.bin',
        checksum: 'abc123',
      });
      expect(status).toBe(403);
    });

    it('GET /firmwares without auth returns 401', async () => {
      const { status } = await get('/firmwares');
      expect(status).toBe(401);
    });

    it('GET /firmwares/:nonExistentId returns 404', async () => {
      const { status } = await api('GET', '/firmwares/00000000-0000-0000-0000-000000000000', auth.alice.jwt);
      expect(status).toBe(404);
    });
  });
}
