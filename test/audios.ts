
import { auth, api, BASE_URL } from './helpers';

export let avatarAudioId: string;

/** Create a small test audio buffer */
function createTestAudioBuffer(): ArrayBuffer {
  const bytes = new Uint8Array(256);
  bytes[0] = 0xff; // sync
  bytes[1] = 0xfb; // MPEG1 Layer3
  bytes[2] = 0x90; // 128kbps, 44100Hz
  return bytes.buffer as ArrayBuffer;
}

/** Upload an audio file to POST /audios with entity ID via multipart/form-data */
async function uploadAudio(jwt: string, entityField: string, entityId: string): Promise<{ status: number; body: any }> {
  const audioBuffer = createTestAudioBuffer();

  const formData = new FormData();
  formData.append('file', new File([audioBuffer], 'test.mp3', { type: 'audio/mpeg' }));
  formData.append(entityField, entityId);

  const res = await fetch(`${BASE_URL}/audios`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });
  return { status: res.status, body: await res.json() };
}

export function describeAudios() {
  describe('audios Controller (e2e)', () => {
    let avatarId: string;

    // ─── Fetch prerequisite IDs ────────────────────────────────

    it('fetch an avatar ID', async () => {
      const { status, body } = await api('GET', '/avatars?published=all', auth.admin.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBeGreaterThan(0);
      avatarId = body.data[0].id;
    });

    // ─── AUTH: only authenticated users can upload ─────────────

    it('anonymous cannot upload an audio', async () => {
      const formData = new FormData();
      formData.append('file', new File([createTestAudioBuffer()], 'test.mp3', { type: 'audio/mpeg' }));
      formData.append('avatarId', 'fake-id');
      const res = await fetch(`${BASE_URL}/audios`, { method: 'POST', body: formData });
      expect(res.status).toBe(401);
    });

    // ─── VALIDATION: must provide exactly one entity ID ────────

    it('rejects upload with no entity ID', async () => {
      const formData = new FormData();
      formData.append('file', new File([createTestAudioBuffer()], 'test.mp3', { type: 'audio/mpeg' }));
      const res = await fetch(`${BASE_URL}/audios`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.admin.jwt}` },
        body: formData,
      });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error).toContain('exactly one entity ID');
    });

    // ─── CREATE: upload audio for avatar ───────────────────────

    it('admin uploads an introduction audio for an avatar', async () => {
      const { status, body } = await uploadAudio(auth.admin.jwt, 'avatarId', avatarId);
      if (status !== 200) console.log('Upload failed:', JSON.stringify(body));
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('avatarId', avatarId);
      avatarAudioId = body.id;
    });

    // ─── READ: serve audio as mp3 ──────────────────────────────

    it('serves avatar audio as mp3', async () => {
      const res = await fetch(`${BASE_URL}/audios/${avatarAudioId}/audio.mp3`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('audio/mpeg');
      const buf = await res.arrayBuffer();
      expect(buf.byteLength).toBeGreaterThan(0);
    });

    // ─── READ: serve audio by entity type ──────────────────────

    it('serves avatar audio via /by/avatars/:id/audio.mp3', async () => {
      const res = await fetch(`${BASE_URL}/audios/by/avatars/${avatarId}/audio.mp3`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('audio/mpeg');
    });

    // ─── READ: 404 for non-existent audio ───────────────────────

    it('returns 404 for non-existent audio', async () => {
      const res = await fetch(`${BASE_URL}/audios/00000000-0000-0000-0000-000000000000/audio.mp3`);
      expect(res.status).toBe(404);
    });

    // ─── REPLACE: re-upload replaces old audio ─────────────────

    it('re-uploading for same avatar replaces the old audio', async () => {
      const { status, body } = await uploadAudio(auth.admin.jwt, 'avatarId', avatarId);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body.id).not.toBe(avatarAudioId);
      // Old audio should be gone
      const oldRes = await fetch(`${BASE_URL}/audios/${avatarAudioId}/audio.mp3`);
      expect(oldRes.status).toBe(404);
      avatarAudioId = body.id;
    });

    // ─── DELETE: remove an audio ───────────────────────────────

    it('admin deletes the avatar audio', async () => {
      const { status } = await api('DELETE', `/audios/${avatarAudioId}`, auth.admin.jwt);
      expect(status).toBe(200);
    });

    it('deleted audio returns 404', async () => {
      const res = await fetch(`${BASE_URL}/audios/${avatarAudioId}/audio.mp3`);
      expect(res.status).toBe(404);
    });
  });
}
