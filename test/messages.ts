
import { auth, api, get } from './helpers';

export function describeMessages() {
  describe('Messages', () => {

    let hanaChatId: string;
    let joiChatId: string;
    let joiChatMessage1Id: string;

    // ─── Setup: fetch chats ────────────────────────────────────

    it('alice fetches her chats', async () => {
      const { status, body } = await api('GET', '/chats', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(2);

      // Find hana and joi chats by avatar name
      for (const chat of body.data) {
        const { body: chatDetail } = await api('GET', `/chats/${chat.id}`, auth.alice.jwt);
        if (chatDetail.avatar?.name === 'Hana') hanaChatId = chat.id;
        if (chatDetail.avatar?.name === 'Joi') joiChatId = chat.id;
      }
      expect(hanaChatId).toBeDefined();
      expect(joiChatId).toBeDefined();
    });

    // ─── Get greeting messages ─────────────────────────────────

    it('alice gets her greeting message from joiChat', async () => {
      const { status, body } = await api('GET', `/messages?chatId=${joiChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('meta');
      expect(body.meta.hasMore).toBe(false);
      expect(body.meta.prevCursor).toBe(null);
      expect(body.meta.nextCursor).toBe(null);
      expect(body.meta.limit).toBe(10);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      joiChatMessage1Id = body.data[0].id;
    });

    it('alice get the message by ID', async () => {
      const { status, body } = await api('GET', `/messages/${joiChatMessage1Id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('content');
    });

    // ─── Post message (text) ───────────────────────────────────

    it('alice post a text message to the joiChat', async () => {
      const { status, body } = await api('POST', '/messages', auth.alice.jwt, {
        chatId: joiChatId,
        content: "Can I take a shower first? I'm sweaty from work.",
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
    });

    // ─── Get messages (cursor pagination) ──────────────────────

    it('alice gets messages from the joiChat', async () => {
      const { status, body } = await api('GET', `/messages?chatId=${joiChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('hasMore');
      expect(body.meta).toHaveProperty('limit');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(2);
    });

    // ─── Anonymous access tests ────────────────────────────────

    it('anonymous POST /messages returns 401', async () => {
      const res = await fetch(`${process.env.BASE_URL ?? 'http://localhost:4000'}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: joiChatId, content: 'hello' }),
      });
      expect(res.status).toBe(401);
    });

    it('anonymous GET /messages returns 401', async () => {
      const { status } = await get('/messages');
      expect(status).toBe(401);
    });

    it('anonymous GET /messages/:id returns 401', async () => {
      const { status } = await get(`/messages/${joiChatMessage1Id}`);
      expect(status).toBe(401);
    });

    // ─── Invalid input tests ───────────────────────────────────

    it('POST /messages with missing chatId returns 422', async () => {
      const { status } = await api('POST', '/messages', auth.alice.jwt, {
        content: 'no chat id',
      });
      expect(status).toBe(422);
    });

    it('POST /messages with non-existent chatId returns 404', async () => {
      const { status } = await api('POST', '/messages', auth.alice.jwt, {
        chatId: '00000000-0000-0000-0000-000000000000',
        content: 'orphaned message',
      });
      expect(status).toBe(404);
    });

    it('GET /messages with non-existent chatId returns empty', async () => {
      const { status, body } = await api('GET', '/messages?chatId=00000000-0000-0000-0000-000000000000', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    it('GET /messages/:id with non-existent id returns 404', async () => {
      const { status } = await api('GET', '/messages/00000000-0000-0000-0000-000000000000', auth.alice.jwt);
      expect(status).toBe(404);
    });

    // ─── ResponseMessageDto shape ──────────────────────────────

    it('ResponseMessageDto has expected shape', async () => {
      const { status, body } = await api('GET', `/messages/${joiChatMessage1Id}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('content');
      expect(body).toHaveProperty('role');
      expect(body).toHaveProperty('chatId');
      expect(body).toHaveProperty('userId');
      expect(body).toHaveProperty('createdAt');
      expect(body).toHaveProperty('updatedAt');
      expect(body).toHaveProperty('explicit');
      expect(body).toHaveProperty('completed');
      expect(body).toHaveProperty('mood');
    });

    // ─── Cross-user access tests ───────────────────────────────

    it('bob cannot GET alice joiChat messages', async () => {
      const { status, body } = await api('GET', `/messages?chatId=${joiChatId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
    });

    it('bob cannot POST a message to alice joiChat', async () => {
      const { status } = await api('POST', '/messages', auth.bob.jwt, {
        chatId: joiChatId,
        content: 'hacking attempt',
      });
      expect(status).toBe(403);
    });

    it('bob CAN get alice message by ID (no ownership check on findOne)', async () => {
      const { status, body } = await api('GET', `/messages/${joiChatMessage1Id}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', joiChatMessage1Id);
    });

    it('bob cannot DELETE alice joiChat message', async () => {
      const { status } = await api('DELETE', `/messages/${joiChatMessage1Id}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    // ─── Delete message ────────────────────────────────────────

    let deleteTestMessageId: string;

    it('alice posts a disposable message for delete testing', async () => {
      const { status, body } = await api('POST', '/messages', auth.alice.jwt, {
        chatId: joiChatId,
        content: 'This message will be deleted',
      });
      expect(status).toBe(200);
      deleteTestMessageId = body.id;
    });

    it('alice deletes the disposable message', async () => {
      const { status } = await api('DELETE', `/messages/${deleteTestMessageId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('deleted message returns 404', async () => {
      const { status } = await api('GET', `/messages/${deleteTestMessageId}`, auth.alice.jwt);
      expect(status).toBe(404);
    });
  });
}
