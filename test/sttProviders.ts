
import { auth, api, get } from './helpers';

// Module-level IDs for cross-test imports
export let assemblyAIId: string;
export let localWhisperId: string;
export let groqWhisperId: string;

export function describeSttProviders() {
  describe('sttProvider Controller (e2e)', () => {

    // ─── READ: no providers exist yet ─────────────────────────────

    it('get alice empty stt-services', async () => {
      const { status, body } = await api('GET', '/stt-providers', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    // ─── ADMIN creates providers ────────────────────────────────

    it('admin post a assemblyAI stt-service', async () => {
      const { status, body } = await api('POST', '/stt-providers', auth.admin.jwt, {
        name: 'AssemblyAI',
        dollarPerSecond: 0.000022,
        recommended: false,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'AssemblyAI');
      expect(Number(body.dollarPerSecond)).toBeCloseTo(0.000022);
      assemblyAIId = body.id;
    });

    it('admin post a Local Whisper stt-service', async () => {
      const { status, body } = await api('POST', '/stt-providers', auth.admin.jwt, {
        name: 'LocalWhisper',
        dollarPerSecond: 0,
        recommended: false,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'LocalWhisper');
      expect(Number(body.dollarPerSecond)).toBe(0);
      localWhisperId = body.id;
    });

    it('admin post a Groq Whisper stt-service', async () => {
      const { status, body } = await api('POST', '/stt-providers', auth.admin.jwt, {
        name: 'GroqWhisper',
        dollarPerSecond: 0.000011,
        recommended: false,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'GroqWhisper');
      expect(Number(body.dollarPerSecond)).toBeCloseTo(0.000011);
      groqWhisperId = body.id;
    });

    // ─── READ: 3 providers exist ────────────────────────────────

    it('get 3 stt Providers ordered by name asc (none recommended yet) as alice', async () => {
      const { status, body } = await api('GET', '/stt-providers', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(3);
      // ordered by recommended desc, name asc — none recommended, so pure name asc
      expect(body.data.map((p: any) => p.name)).toEqual([
        'AssemblyAI',
        'GroqWhisper',
        'LocalWhisper',
      ]);
      const localWhisper = body.data.find((p: any) => p.name === 'LocalWhisper');
      const assemblyAI = body.data.find((p: any) => p.name === 'AssemblyAI');
      const groqWhisper = body.data.find((p: any) => p.name === 'GroqWhisper');
      expect(assemblyAI.free).toBe(false);
      expect(localWhisper.free).toBe(true);
      expect(groqWhisper.free).toBe(false);
    });

    it('get 3 stt Providers ordered by name asc (none recommended yet) without JWT', async () => {
      const { status, body } = await get('/stt-providers');
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(3);
      expect(body.data.map((p: any) => p.name)).toEqual([
        'AssemblyAI',
        'GroqWhisper',
        'LocalWhisper',
      ]);
      const localWhisper = body.data.find((p: any) => p.name === 'LocalWhisper');
      const assemblyAI = body.data.find((p: any) => p.name === 'AssemblyAI');
      const groqWhisper = body.data.find((p: any) => p.name === 'GroqWhisper');
      expect(assemblyAI.free).toBe(false);
      expect(localWhisper.free).toBe(true);
      expect(groqWhisper.free).toBe(false);
    });

    // ─── READ: by ID ────────────────────────────────────────────

    it('gets stt Provider localWhisper as alice', async () => {
      const { status, body } = await api('GET', `/stt-providers/${localWhisperId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', localWhisperId);
    });

    it('gets stt Provider localWhisper without JWT', async () => {
      const { status, body } = await get(`/stt-providers/${localWhisperId}`);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', localWhisperId);
    });

    // ─── UPDATE ─────────────────────────────────────────────────

    it('updates localWhisper to recommended via jwtAdmin', async () => {
      const { status, body } = await api('PATCH', `/stt-providers/${localWhisperId}`, auth.admin.jwt, {
        name: 'LocalWhisper',
        dollarPerSecond: 0,
        recommended: true,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('recommended', true);
    });

    it('get 3 stt Providers with LocalWhisper first (recommended) then name asc as alice', async () => {
      const { status, body } = await api('GET', '/stt-providers', auth.alice.jwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(3);
      // LocalWhisper is recommended so first, then AssemblyAI and GroqWhisper by name asc
      expect(body.data.map((p: any) => p.name)).toEqual([
        'LocalWhisper',
        'AssemblyAI',
        'GroqWhisper',
      ]);
    });
  });
}
