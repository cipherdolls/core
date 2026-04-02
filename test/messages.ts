
import { auth, api, get, connectMqtt, waitForQueuesEmpty, assertValidProcessEvents, groupByResourceName, BASE_URL, type ProcessEvent, type MqttClient } from './helpers';
import WebSocket from 'ws';

export function describeMessages() {
  describe('Messages', () => {

    let hanaChatId: string;
    let joiChatId: string;
    let joiChatMessage1Id: string;

    let aliceMqttClient: MqttClient;
    let aliceChatProcessEvents: ProcessEvent[] = [];
    let aliceUserProcessEvents: ProcessEvent[] = [];

    // Stream-player WebSocket TTS capture
    const STREAM_PLAYER_URL = process.env.STREAM_PLAYER_URL ?? 'ws://stream-player:8001';
    let streamPlayerWs: WebSocket;
    let ttsTextMessages: any[] = [];
    let ttsBinaryChunks: Buffer[] = [];
    let lastTtsMp3Buffer: Buffer | null = null;

    function connectStreamPlayerWs(chatId: string): Promise<void> {
      return new Promise((resolve, reject) => {
        const url = `${STREAM_PLAYER_URL}/ws-player?auth=${encodeURIComponent(auth.alice.jwt)}&chatId=${encodeURIComponent(chatId)}`;
        streamPlayerWs = new WebSocket(url);
        streamPlayerWs.binaryType = 'nodebuffer';
        streamPlayerWs.on('open', () => resolve());
        streamPlayerWs.on('error', (err) => reject(err));
        streamPlayerWs.on('message', (data: Buffer, isBinary: boolean) => {
          if (isBinary) {
            ttsBinaryChunks.push(data);
          } else {
            try {
              ttsTextMessages.push(JSON.parse(data.toString()));
            } catch {}
          }
        });
      });
    }

    // ─── MQTT setup ───────────────────────────────────────────

    it('connect alice MQTT client for messages', async () => {
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
    });

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

      // Subscribe to MQTT topics for both chats
      aliceMqttClient.subscribe(`users/${auth.alice.userId}/processEvents`);
      aliceMqttClient.subscribe(`chats/${hanaChatId}/processEvents`);
      aliceMqttClient.subscribe(`chats/${joiChatId}/processEvents`);
      aliceMqttClient.on('message', (topic, msg) => {
        const [resourceType] = topic.split('/');
        const event = JSON.parse(msg.toString()) as ProcessEvent;
        if (resourceType === 'users') {
          aliceUserProcessEvents.push(event);
        } else if (resourceType === 'chats') {
          aliceChatProcessEvents.push(event);
        }
      });
    });

    it('queues are empty before messages tests', async () => {
      await waitForQueuesEmpty(60000);
      expect(aliceUserProcessEvents.length).toBe(0);
      expect(aliceChatProcessEvents.length).toBe(0);
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
      expect(body).toHaveProperty('content', "Can I take a shower first? I'm sweaty from work.");
      expect(body).toHaveProperty('chatId', joiChatId);
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

    it('alice can read ALL messages in her chat (USER + ASSISTANT roles)', async () => {
      const { status, body } = await api('GET', `/messages?chatId=${joiChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      // meta.total matches the actual data length (no messages hidden)
      expect(body.data.length).toBe(body.meta.total);
      // Chat contains both USER and ASSISTANT messages
      const roles = body.data.map((m: any) => m.role);
      expect(roles).toContain('USER');
      expect(roles).toContain('ASSISTANT');
      // Every message has content or fileName
      for (const msg of body.data) {
        expect(msg.content !== null || msg.fileName !== null).toBe(true);
      }
      // Every message belongs to this chat
      for (const msg of body.data) {
        expect(msg.chatId).toBe(joiChatId);
      }
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
      expect(body.meta.total).toBe(0);
    });

    let bobChatId: string;

    it('bob creates a temporary chat for cross-user message tests', async () => {
      const { body: avatars } = await api('GET', '/avatars?published=true', auth.bob.jwt);
      const { body: scenarios } = await api('GET', '/scenarios?published=true', auth.bob.jwt);
      const { status, body } = await api('POST', '/chats', auth.bob.jwt, {
        avatarId: avatars.data[0].id,
        scenarioId: scenarios.data[0].id,
        tts: false,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      bobChatId = body.id;
    });

    it('bob posts a private message to his chat', async () => {
      const { status, body } = await api('POST', '/messages', auth.bob.jwt, {
        chatId: bobChatId,
        content: 'This is private to bob',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('content', 'This is private to bob');
      expect(body).toHaveProperty('chatId', bobChatId);
    });

    it('alice cannot read messages from bob chat', async () => {
      const { status, body } = await api('GET', `/messages?chatId=${bobChatId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.data.length).toBe(0);
      expect(body.meta.total).toBe(0);
    });

    it('bob can read his own chat messages', async () => {
      const { body: bobMsgs } = await api('GET', `/messages?chatId=${bobChatId}`, auth.bob.jwt);
      expect(bobMsgs.data.length).toBeGreaterThan(0);
      expect(bobMsgs.meta.total).toBeGreaterThan(0);
    });

    it('cleanup bob temporary chat', async () => {
      const { status } = await api('DELETE', `/chats/${bobChatId}`, auth.bob.jwt);
      expect(status).toBe(200);
    });

    it('bob cannot POST a message to alice joiChat', async () => {
      const { status } = await api('POST', '/messages', auth.bob.jwt, {
        chatId: joiChatId,
        content: 'hacking attempt',
      });
      expect(status).toBe(403);
    });

    it('bob CANNOT get alice message by ID (403)', async () => {
      const { status } = await api('GET', `/messages/${joiChatMessage1Id}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    it('bob cannot DELETE alice joiChat message', async () => {
      const { status } = await api('DELETE', `/messages/${joiChatMessage1Id}`, auth.bob.jwt);
      expect(status).toBe(403);
    });

    // ─── PATCH message ──────────────────────────────────────────

    let patchTestMessageId: string;

    it('alice posts a message for PATCH testing', async () => {
      const { status, body } = await api('POST', '/messages', auth.alice.jwt, {
        chatId: joiChatId,
        content: 'original content',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('content', 'original content');
      expect(body).toHaveProperty('chatId', joiChatId);
      patchTestMessageId = body.id;
    });

    it('alice can update her message content', async () => {
      const { status, body } = await api('PATCH', `/messages/${patchTestMessageId}`, auth.alice.jwt, {
        content: 'updated content',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('content', 'updated content');
    });

    it('bob cannot update alice message (403)', async () => {
      const { body: msgs } = await api('GET', `/messages?chatId=${joiChatId}`, auth.alice.jwt);
      const msgId = msgs.data[0].id;
      const { status } = await api('PATCH', `/messages/${msgId}`, auth.bob.jwt, {
        content: 'hacked',
      });
      expect(status).toBe(403);
    });

    it('PATCH non-existent message returns 404', async () => {
      const { status } = await api('PATCH', '/messages/00000000-0000-0000-0000-000000000000', auth.alice.jwt, {
        content: 'test',
      });
      expect(status).toBe(404);
    });

    // ─── Delete message ────────────────────────────────────────

    let deleteTestMessageId: string;

    it('alice posts a disposable message for delete testing', async () => {
      const { status, body } = await api('POST', '/messages', auth.alice.jwt, {
        chatId: joiChatId,
        content: 'This message will be deleted',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('content', 'This message will be deleted');
      expect(body).toHaveProperty('chatId', joiChatId);
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

    // ─── Scenario switch + AI response tests ──────────────────

    it('alice switches hanaChat to Small Talk scenario with tts off', async () => {
      const { body: scenarios } = await api('GET', '/scenarios?name=Small+Talk', auth.alice.jwt);
      const smallTalkScenario = scenarios.data[0];
      expect(smallTalkScenario).toBeTruthy();

      const { status, body } = await api('PATCH', `/chats/${hanaChatId}`, auth.alice.jwt, {
        scenarioId: smallTalkScenario.id,
        tts: false,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('scenarioId', smallTalkScenario.id);
      expect(body).toHaveProperty('tts', false);
    });

    it('processEvents after scenario switch contain Chat update', async () => {
      await waitForQueuesEmpty(60000);
      assertValidProcessEvents(aliceChatProcessEvents);
      assertValidProcessEvents(aliceUserProcessEvents);
      const events = groupByResourceName(aliceChatProcessEvents);
      expect(events.Chat?.length).toBeGreaterThanOrEqual(2); // active + completed
      aliceChatProcessEvents = [];
      aliceUserProcessEvents = [];
    });

    // ─── Message: "What is the capital of Germany?" ───────────

    let messageCountBeforeGermany: number;

    it('count messages before Germany question', async () => {
      const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      messageCountBeforeGermany = body.meta.total;
    });

    it('alice posts "What is the capital of Germany?" to hanaChat', async () => {
      const { status, body } = await api('POST', '/messages', auth.alice.jwt, {
        chatId: hanaChatId,
        content: 'What is the capital of Germany?',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('content', 'What is the capital of Germany?');
      expect(body).toHaveProperty('chatId', hanaChatId);
    });

    it('hanaChat has 2 more messages after Germany question (USER + ASSISTANT)', async () => {
      let total = messageCountBeforeGermany;
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
        total = body.meta.total;
        if (total >= messageCountBeforeGermany + 2) break;
      }
      expect(total).toBeGreaterThanOrEqual(messageCountBeforeGermany + 2);
    });

    it('AI response contains "Berlin"', async () => {
      const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      const assistantMsg = body.data.find((m: any) => m.role === 'ASSISTANT' && m.content?.toLowerCase().includes('berlin'));
      expect(assistantMsg).toBeTruthy();
    });

    // ─── Message: "What is the capital of France?" ────────────

    let messageCountBeforeFrance: number;

    it('count messages before France question', async () => {
      const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      messageCountBeforeFrance = body.meta.total;
    });

    it('alice posts "What is the capital of France?" to hanaChat', async () => {
      const { status, body } = await api('POST', '/messages', auth.alice.jwt, {
        chatId: hanaChatId,
        content: 'What is the capital of France?',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('content', 'What is the capital of France?');
      expect(body).toHaveProperty('chatId', hanaChatId);
    });

    it('hanaChat has 2 more messages after France question (USER + ASSISTANT)', async () => {
      let total = messageCountBeforeFrance;
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
        total = body.meta.total;
        if (total >= messageCountBeforeFrance + 2) break;
      }
      expect(total).toBeGreaterThanOrEqual(messageCountBeforeFrance + 2);
    });

    it('AI response contains "Paris"', async () => {
      const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      const assistantMsg = body.data.find((m: any) => m.role === 'ASSISTANT' && m.content?.toLowerCase().includes('paris'));
      expect(assistantMsg).toBeTruthy();
    });

    // ─── Chat history verification: "What was my last question?" ─

    let messageCountBeforeHistoryCheck: number;

    it('count messages before chat history check', async () => {
      const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      messageCountBeforeHistoryCheck = body.meta.total;
    });

    it('alice asks "What was my last question?" to hanaChat', async () => {
      const { status, body } = await api('POST', '/messages', auth.alice.jwt, {
        chatId: hanaChatId,
        content: 'What was my last question?',
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('content', 'What was my last question?');
      expect(body).toHaveProperty('chatId', hanaChatId);
    });

    it('hanaChat has 2 more messages after history check question (USER + ASSISTANT)', async () => {
      let total = messageCountBeforeHistoryCheck;
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
        total = body.meta.total;
        if (total >= messageCountBeforeHistoryCheck + 2) break;
      }
      expect(total).toBeGreaterThanOrEqual(messageCountBeforeHistoryCheck + 2);
    });

    it('AI response references the previous question about France (chat history works)', async () => {
      const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);

      // Log all messages for debugging
      console.log(`Chat history (${body.data.length} messages):`);
      for (const m of body.data) {
        console.log(`  [${m.role}] ${m.content?.substring(0, 100)}${m.content?.length > 100 ? '…' : ''}`);
      }

      // The newest message is first (reverse chronological order from API)
      const newestAssistant = body.data.find((m: any) => m.role === 'ASSISTANT');
      expect(newestAssistant).toBeTruthy();

      const content = newestAssistant.content.toLowerCase();
      // The AI should reference the conversation — mentioning france, capital, or germany proves it sees history
      const referencesHistory = content.includes('france') || content.includes('capital') || content.includes('germany');
      expect(referencesHistory).toBe(true);

      console.log(`Chat history test — AI response: "${newestAssistant.content}"`);
    });

    // ─── Audio message tests ────────────────────────────────────

    let audioMessageId: string;

    it('alice uploads an audio message to hanaChat via multipart', async () => {
      // Create a minimal MP3 file (MPEG frame header + silence)
      const mp3Header = new Uint8Array([
        0xFF, 0xFB, 0x90, 0x00, // MPEG1 Layer3 frame header
        ...new Array(417).fill(0), // silence padding (one frame)
      ]);

      const formData = new FormData();
      formData.append('chatId', hanaChatId);
      formData.append('file', new File([mp3Header.buffer as ArrayBuffer], 'audio.mp3', { type: 'audio/mpeg' }));

      const res = await fetch(`${BASE_URL}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
        body: formData,
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('fileName');
      expect(body.fileName).toMatch(/\.mp3$/);
      expect(body.content).toBeNull();
      audioMessageId = body.id;
    });

    it('alice can get the audio message by ID', async () => {
      const { status, body } = await api('GET', `/messages/${audioMessageId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', audioMessageId);
      expect(body).toHaveProperty('fileName');
      expect(body.fileName).toMatch(/\.mp3$/);
    });

    it('alice can download the audio file', async () => {
      const res = await fetch(`${BASE_URL}/messages/${audioMessageId}/audio`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('audio/mpeg');
      const buffer = await res.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    it('audio endpoint returns 404 for message without audio', async () => {
      // Find a text-only message
      const { body: msgs } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      const textMsg = msgs.data.find((m: any) => !m.fileName);
      expect(textMsg).toBeTruthy();

      const res = await fetch(`${BASE_URL}/messages/${textMsg.id}/audio`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      expect(res.status).toBe(404);
    });

    it('audio endpoint returns 404 for non-existent message', async () => {
      const res = await fetch(`${BASE_URL}/messages/00000000-0000-0000-0000-000000000000/audio`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      expect(res.status).toBe(404);
    });

    it('alice uploads audio+text message (text takes priority)', async () => {
      const mp3Header = new Uint8Array([0xFF, 0xFB, 0x90, 0x00, ...new Array(417).fill(0)]);

      const formData = new FormData();
      formData.append('chatId', hanaChatId);
      formData.append('content', 'Text with audio attached');
      formData.append('file', new File([mp3Header.buffer as ArrayBuffer], 'voice.mp3', { type: 'audio/mpeg' }));

      const res = await fetch(`${BASE_URL}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
        body: formData,
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toHaveProperty('content', 'Text with audio attached');
      expect(body).toHaveProperty('fileName');
      expect(body.fileName).toMatch(/\.mp3$/);
    });

    it('alice deletes the audio message', async () => {
      const { status } = await api('DELETE', `/messages/${audioMessageId}`, auth.alice.jwt);
      expect(status).toBe(200);
    });

    it('deleted audio message returns 404', async () => {
      const res = await fetch(`${BASE_URL}/messages/${audioMessageId}/audio`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      expect(res.status).toBe(404);
    });

    // ─── Kokoro TTS → audio message → STT → LLM → TTS → Whisper ──

    const KOKORO_URL = process.env.CIPHERDOLLS_KOKORO_URL ?? 'https://kokoro.ffaerber.duckdns.org';
    const WHISPER_URL = process.env.WHISPER_URL ?? 'https://whisper.ffaerber.duckdns.org';
    let kokoroAudioBuffer: ArrayBuffer;
    let kokoroAudioMessageId: string;
    let messageCountBeforeKokoro: number;

    it('processEvents before Kokoro pipeline contain Message and ChatCompletionJob events', async () => {
      await waitForQueuesEmpty(60000);
      assertValidProcessEvents(aliceChatProcessEvents);
      assertValidProcessEvents(aliceUserProcessEvents);
      const events = groupByResourceName(aliceChatProcessEvents);
      expect(events.Message?.length).toBeGreaterThanOrEqual(2);
      expect(events.ChatCompletionJob?.length).toBeGreaterThanOrEqual(2);
      aliceChatProcessEvents = [];
      aliceUserProcessEvents = [];
    });

    it('connect stream-player WebSocket for hanaChat TTS streaming', async () => {
      await connectStreamPlayerWs(hanaChatId);
      ttsTextMessages = [];
      ttsBinaryChunks = [];
    });

    it('alice enables TTS on hanaChat', async () => {
      const { status, body } = await api('PATCH', `/chats/${hanaChatId}`, auth.alice.jwt, { tts: true });
      expect(status).toBe(200);
      expect(body).toHaveProperty('tts', true);
    });

    it('generate audio via Kokoro TTS asking "What is the capital of Italy?"', async () => {
      const res = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro',
          input: 'What is the capital of Italy?',
          voice: 'af_heart',
          response_format: 'mp3',
        }),
      });
      expect(res.status).toBe(200);
      kokoroAudioBuffer = await res.arrayBuffer();
      expect(kokoroAudioBuffer.byteLength).toBeGreaterThan(1000);
    });

    it('count messages before Kokoro audio upload', async () => {
      const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      messageCountBeforeKokoro = body.meta.total;
    });

    it('alice uploads the Kokoro audio as a message to hanaChat', async () => {
      const formData = new FormData();
      formData.append('chatId', hanaChatId);
      formData.append('file', new File([kokoroAudioBuffer], 'kokoro.mp3', { type: 'audio/mpeg' }));

      const res = await fetch(`${BASE_URL}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
        body: formData,
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('fileName');
      expect(body.fileName).toMatch(/\.mp3$/);
      expect(body.content).toBeNull();
      kokoroAudioMessageId = body.id;
    });

    it('Kokoro audio file is downloadable and valid MP3', async () => {
      const res = await fetch(`${BASE_URL}/messages/${kokoroAudioMessageId}/audio`, {
        headers: { Authorization: `Bearer ${auth.alice.jwt}` },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('audio/mpeg');
      const buffer = await res.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(1000);
    });

    it('STT transcribes the audio and populates the message content with "italy" or "capital"', async () => {
      // Poll until the message content is populated by the STT pipeline
      let content: string | null = null;
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const { body } = await api('GET', `/messages/${kokoroAudioMessageId}`, auth.alice.jwt);
        content = body.content;
        if (content) break;
      }
      expect(content).toBeTruthy();
      const lower = content!.toLowerCase();
      expect(lower.includes('italy') || lower.includes('capital')).toBe(true);
    });

    it('pipeline creates an ASSISTANT response after STT transcription', async () => {
      let total = messageCountBeforeKokoro;
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
        total = body.meta.total;
        if (total >= messageCountBeforeKokoro + 2) break;
      }
      expect(total).toBeGreaterThanOrEqual(messageCountBeforeKokoro + 2);
    });

    it('ASSISTANT response to audio question contains "Rome"', async () => {
      const { body } = await api('GET', `/messages?chatId=${hanaChatId}`, auth.alice.jwt);
      const assistantMsg = body.data.find((m: any) => m.role === 'ASSISTANT' && m.content?.toLowerCase().includes('rome'));
      expect(assistantMsg).toBeTruthy();
    });

    it('streams ASSISTANT TTS audio via stream-player WebSocket', async () => {
      // Wait for tts_end to arrive via WebSocket
      await new Promise<void>((resolve, reject) => {
        if (ttsTextMessages.find((m) => m.type === 'tts_end')) return resolve();
        const checkInterval = 100;
        const maxWait = 30000;
        let elapsed = 0;
        const interval = setInterval(() => {
          elapsed += checkInterval;
          if (ttsTextMessages.find((m) => m.type === 'tts_end')) {
            clearInterval(interval);
            resolve();
          } else if (elapsed >= maxWait) {
            clearInterval(interval);
            reject(new Error('Timed out waiting for tts_end WebSocket message'));
          }
        }, checkInterval);
      });

      const ttsStart = ttsTextMessages.find((m) => m.type === 'tts_start');
      const ttsEnd = ttsTextMessages.find((m) => m.type === 'tts_end');
      expect(ttsStart).toBeDefined();
      expect(ttsStart.messageId).toBeDefined();
      expect(ttsStart.format).toBe('mp3');
      expect(ttsEnd).toBeDefined();
      expect(ttsEnd.messageId).toBe(ttsStart.messageId);

      const totalBytes = ttsBinaryChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      expect(totalBytes).toBeGreaterThan(0);
      expect(ttsBinaryChunks.length).toBeGreaterThanOrEqual(1);

      lastTtsMp3Buffer = Buffer.concat(ttsBinaryChunks);
      ttsTextMessages = [];
      ttsBinaryChunks = [];
    });

    it('Whisper transcription of streamed ASSISTANT audio contains "Rome"', async () => {
      expect(lastTtsMp3Buffer).not.toBeNull();
      expect(lastTtsMp3Buffer!.length).toBeGreaterThan(0);

      const formData = new FormData();
      formData.append('audio_file', new File([new Uint8Array(lastTtsMp3Buffer!)], 'assistant.mp3', { type: 'audio/mpeg' }));

      const whisperRes = await fetch(`${WHISPER_URL}/asr?encode=true&task=transcribe&output=json&language=en`, {
        method: 'POST',
        body: formData,
      });
      expect(whisperRes.status).toBe(200);
      const transcript = await whisperRes.json() as any;
      const text = (transcript.text ?? '').toLowerCase();
      expect(text).toContain('rome');
    });

    // ─── Verify MQTT events from Kokoro pipeline ──────────────

    it('aliceChatProcessEvents contains Message, SttJob, ChatCompletionJob, and TtsJob events', async () => {
      // Wait for any remaining events to arrive
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(aliceChatProcessEvents);

      // USER audio message created
      const messages = events.Message || [];
      expect(messages.length).toBeGreaterThanOrEqual(2); // active+completed for user, active+completed for assistant

      // STT job processed the audio
      const sttJobs = events.SttJob || [];
      expect(sttJobs.length).toBeGreaterThanOrEqual(2); // active+completed

      // Chat completion ran after STT
      const ccJobs = events.ChatCompletionJob || [];
      expect(ccJobs.length).toBeGreaterThanOrEqual(2); // active+completed

      // TTS generated audio for assistant response
      const ttsJobs = events.TtsJob || [];
      expect(ttsJobs.length).toBeGreaterThanOrEqual(2); // active+completed

      aliceChatProcessEvents = [];
    });

    // ─── MQTT cleanup ─────────────────────────────────────────

    it('close alice MQTT client for messages', () => {
      streamPlayerWs?.close();
      aliceMqttClient?.end();
    });
  });
}
