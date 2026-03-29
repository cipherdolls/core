
import { auth, api, BASE_URL } from './helpers';

export let aiProviderPictureId: string;
export let ttsProviderPictureId: string;

/** Download a real PNG from the web to use as test image */
async function fetchTestImage(): Promise<ArrayBuffer> {
  const res = await fetch('https://www.google.com/photos/about/static/images/ui/logo-photos.png');
  return res.arrayBuffer();
}

/** Upload a file to POST /pictures with entity ID via multipart/form-data */
async function uploadPicture(jwt: string, entityField: string, entityId: string): Promise<{ status: number; body: any }> {
  const imageBuffer = await fetchTestImage();

  const formData = new FormData();
  formData.append('file', new File([imageBuffer], 'test.png', { type: 'image/png' }));
  formData.append(entityField, entityId);

  const res = await fetch(`${BASE_URL}/pictures`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });
  return { status: res.status, body: await res.json() };
}

export function describePictures() {
  describe('pictures Controller (e2e)', () => {
    let aiProviderId: string;
    let ttsProviderId: string;

    // ─── Fetch prerequisite IDs ────────────────────────────────

    it('fetch an aiProvider ID', async () => {
      const { status, body } = await api('GET', '/ai-providers', auth.admin.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBeGreaterThan(0);
      aiProviderId = body.data[0].id;
    });

    it('fetch a ttsProvider ID', async () => {
      const { status, body } = await api('GET', '/tts-providers', auth.admin.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBeGreaterThan(0);
      ttsProviderId = body.data[0].id;
    });

    // ─── AUTH: only authenticated users can upload ─────────────

    it('anonymous cannot upload a picture', async () => {
      const formData = new FormData();
      formData.append('file', new File([new Uint8Array([0x89]).buffer as ArrayBuffer], 'test.png', { type: 'image/png' }));
      formData.append('aiProviderId', 'fake-id');
      const res = await fetch(`${BASE_URL}/pictures`, { method: 'POST', body: formData });
      expect(res.status).toBe(401);
    });

    // ─── VALIDATION: must provide exactly one entity ID ────────

    it('rejects upload with no entity ID', async () => {
      const formData = new FormData();
      formData.append('file', new File([new Uint8Array([0x89]).buffer as ArrayBuffer], 'test.png', { type: 'image/png' }));
      const res = await fetch(`${BASE_URL}/pictures`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.admin.jwt}` },
        body: formData,
      });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error).toContain('exactly one entity ID');
    });

    // ─── CREATE: upload picture for aiProvider ──────────────────

    it('admin uploads a picture for the aiProvider', async () => {
      const { status, body } = await uploadPicture(auth.admin.jwt, 'aiProviderId', aiProviderId);
      if (status !== 200) console.log('Upload failed:', JSON.stringify(body));
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('aiProviderId', aiProviderId);
      aiProviderPictureId = body.id;
    });

    // ─── READ: serve picture as webp ────────────────────────────

    it('serves aiProvider picture as webp', async () => {
      const res = await fetch(`${BASE_URL}/pictures/${aiProviderPictureId}/picture.webp?x=50&y=50`, {
        headers: { Authorization: `Bearer ${auth.admin.jwt}` },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/webp');
    });

    // ─── READ: serve picture as jpg ─────────────────────────────

    it('serves aiProvider picture as jpg', async () => {
      const res = await fetch(`${BASE_URL}/pictures/${aiProviderPictureId}/picture.jpg?x=50&y=50`, {
        headers: { Authorization: `Bearer ${auth.admin.jwt}` },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/jpeg');
    });

    // ─── READ: resize produces different file sizes ──────────────

    it('different dimensions produce different file sizes', async () => {
      const small = await fetch(`${BASE_URL}/pictures/${aiProviderPictureId}/picture.webp?x=32&y=32`, {
        headers: { Authorization: `Bearer ${auth.admin.jwt}` },
      });
      const large = await fetch(`${BASE_URL}/pictures/${aiProviderPictureId}/picture.webp?x=500&y=500`, {
        headers: { Authorization: `Bearer ${auth.admin.jwt}` },
      });
      expect(small.status).toBe(200);
      expect(large.status).toBe(200);
      const smallBuf = await small.arrayBuffer();
      const largeBuf = await large.arrayBuffer();
      expect(largeBuf.byteLength).toBeGreaterThan(smallBuf.byteLength);
    });

    // ─── READ: default dimensions (100x100) ─────────────────────

    it('serves aiProvider picture with default dimensions', async () => {
      const res = await fetch(`${BASE_URL}/pictures/${aiProviderPictureId}/picture.webp`, {
        headers: { Authorization: `Bearer ${auth.admin.jwt}` },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/webp');
    });

    // ─── READ: 404 for non-existent picture ─────────────────────

    it('returns 404 for non-existent picture', async () => {
      const res = await fetch(`${BASE_URL}/pictures/00000000-0000-0000-0000-000000000000/picture.webp`, {
        headers: { Authorization: `Bearer ${auth.admin.jwt}` },
      });
      expect(res.status).toBe(404);
    });

    // ─── REPLACE: re-upload replaces old picture ────────────────

    it('re-uploading for same entity replaces the old picture', async () => {
      const { status, body } = await uploadPicture(auth.admin.jwt, 'aiProviderId', aiProviderId);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body.id).not.toBe(aiProviderPictureId);
      // Old picture should be gone
      const oldRes = await fetch(`${BASE_URL}/pictures/${aiProviderPictureId}/picture.webp`, {
        headers: { Authorization: `Bearer ${auth.admin.jwt}` },
      });
      expect(oldRes.status).toBe(404);
      aiProviderPictureId = body.id;
    });

    // ─── CREATE: upload picture for ttsProvider ─────────────────

    it('admin uploads a picture for the ttsProvider', async () => {
      const { status, body } = await uploadPicture(auth.admin.jwt, 'ttsProviderId', ttsProviderId);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('ttsProviderId', ttsProviderId);
      ttsProviderPictureId = body.id;
    });

    it('serves ttsProvider picture as webp', async () => {
      const res = await fetch(`${BASE_URL}/pictures/${ttsProviderPictureId}/picture.webp?x=50&y=50`, {
        headers: { Authorization: `Bearer ${auth.admin.jwt}` },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/webp');
    });

    // ─── DELETE: remove a picture ───────────────────────────────

    it('admin deletes the ttsProvider picture', async () => {
      const { status } = await api('DELETE', `/pictures/${ttsProviderPictureId}`, auth.admin.jwt);
      expect(status).toBe(200);
    });

    it('deleted picture returns 404', async () => {
      const res = await fetch(`${BASE_URL}/pictures/${ttsProviderPictureId}/picture.webp`, {
        headers: { Authorization: `Bearer ${auth.admin.jwt}` },
      });
      expect(res.status).toBe(404);
    });
  });
}
