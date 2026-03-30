
import { auth, api, get } from './helpers';

// Module-level IDs for cross-test imports
export let ollamaProviderId: string;
export let ollamaChatProviderId: string;
export let ollamaReasoningProviderId: string;
export let ollamaEmbeddingProviderId: string;
export let openRouterProviderId: string;

export function describeAiProviders() {
  describe('aiProvider', () => {

    // ─── READ: no providers exist yet ─────────────────────────────

    it('gets all AiProviders as alice', async () => {
      const { status, body } = await api('GET', '/ai-providers', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('meta');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
      expect(body.meta.total).toBe(0);
      expect(body.meta.page).toBe(1);
    });

    // ─── WRITE: alice cannot create ─────────────────────────────

    it('can not post a AiProvider as Alice', async () => {
      const { status } = await api('POST', '/ai-providers', auth.alice.jwt, {
        name: 'OpenRouter', apiKey: '1234', basePath: 'https://openrouter.ai/api/v1',
      });
      expect(status).toBe(403);
    });

    // ─── ADMIN creates providers ────────────────────────────────

    it('post a AiProvider Ollama Chat as Admin', async () => {
      const { status, body } = await api('POST', '/ai-providers', auth.admin.jwt, {
        name: 'Ollama Chat', apiKey: 'fakeApiKey', basePath: `${process.env.OLLAMA_CHAT_URL ?? 'http://localhost:11434'}/v1`,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Ollama Chat');
      expect(body).not.toHaveProperty('apiKey');
      ollamaChatProviderId = body.id;
    });

    it('post a AiProvider Ollama Reasoning as Admin', async () => {
      const { status, body } = await api('POST', '/ai-providers', auth.admin.jwt, {
        name: 'Ollama Reasoning', apiKey: 'fakeApiKey', basePath: `${process.env.OLLAMA_REASONING_URL ?? 'http://localhost:11435'}/v1`,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Ollama Reasoning');
      expect(body).not.toHaveProperty('apiKey');
      ollamaReasoningProviderId = body.id;
    });

    it('post a AiProvider Ollama Embedding as Admin', async () => {
      const { status, body } = await api('POST', '/ai-providers', auth.admin.jwt, {
        name: 'Ollama Embedding', apiKey: 'fakeApiKey', basePath: `${process.env.OLLAMA_EMBEDDING_URL ?? 'http://localhost:11436'}/v1`,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Ollama Embedding');
      expect(body).not.toHaveProperty('apiKey');
      ollamaEmbeddingProviderId = body.id;
    });

    it('post a AiProvider openRouter as Admin', async () => {
      const { status, body } = await api('POST', '/ai-providers', auth.admin.jwt, {
        name: 'OpenRouter', apiKey: 'fakeApiKey', basePath: 'https://openrouter.ai/api/v1',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'OpenRouter');
      expect(body).toHaveProperty('basePath', 'https://openrouter.ai/api/v1');
      expect(body).not.toHaveProperty('apiKey');
      openRouterProviderId = body.id;
    });

    it('post a AiProvider ollama as Admin', async () => {
      const { status, body } = await api('POST', '/ai-providers', auth.admin.jwt, {
        name: 'Ollama', apiKey: 'fakeApiKey', basePath: `${process.env.OLLAMA_URL ?? 'http://localhost:11434'}/v1`,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Ollama');
      expect(body).not.toHaveProperty('apiKey');
      ollamaProviderId = body.id;
    });

    // ─── READ: providers exist ──────────────────────────────────

    it('can get AiProvider openrouter as Alice', async () => {
      const res1 = await api('GET', '/ai-providers?name=OpenRouter', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const openRouter = res1.body.data[0];

      const { status } = await get(`/ai-providers/${openRouter.id}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('can get AiProvider openrouter without JWT', async () => {
      const res1 = await api('GET', '/ai-providers?name=OpenRouter', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const openRouter = res1.body.data[0];

      const { status } = await get(`/ai-providers/${openRouter.id}`);
      expect(status).toBe(200);
    });

    it('gets all AiProviders without jwt', async () => {
      const { status, body } = await get('/ai-providers');
      expect(status).toBe(200);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('meta');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(5);
      expect(body.meta.total).toBe(5);
      expect(body.meta.page).toBe(1);
    });

    it('gets all AiProviders as Alice', async () => {
      const { status, body } = await api('GET', '/ai-providers', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('meta');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(5);
      expect(body.meta.total).toBe(5);
      expect(body.meta.page).toBe(1);
    });

    it('gets OpenRouter AiProviders as Alice filter by name', async () => {
      const { status, body } = await api('GET', '/ai-providers?name=OpenRouter', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('meta');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta.total).toBe(1);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(1);
    });

    it('gets all AiProviders as Admin', async () => {
      const { status, body } = await api('GET', '/ai-providers', auth.admin.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('meta');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(5);
      expect(body.meta.total).toBe(5);
      expect(body.meta.page).toBe(1);
    });

    // ─── UPDATE ─────────────────────────────────────────────────

    it('alice can not update AiProvider openrouter as Alice', async () => {
      const res1 = await api('GET', '/ai-providers?name=OpenRouter', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const openRouter = res1.body.data[0];

      const { status } = await api('PATCH', `/ai-providers/${openRouter.id}`, auth.alice.jwt, {
        name: 'xxx',
      });
      expect(status).toBe(403);
    });

    it('updates the AiProvider openRouter as Admin', async () => {
      const res1 = await api('GET', '/ai-providers?name=OpenRouter', auth.alice.jwt);
      expect(res1.status).toBe(200);
      const openRouter = res1.body.data[0];

      const { status, body } = await api('PATCH', `/ai-providers/${openRouter.id}`, auth.admin.jwt, {
        name: 'OpenRouter',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'OpenRouter');
    });
  });
}
