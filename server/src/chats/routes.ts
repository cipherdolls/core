import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';
import { redisConnection } from '../queue/connection';

const chatListInclude = {
  character: { include: { picture: true } },
  _count: { select: { messages: true, chatCompletions: true } },
};

const chatDetailInclude = {
  character: {
    include: {
      picture: true,
      ttsVoice: { include: { ttsProvider: true } },
      chatModel: { include: { aiProvider: true } },
    },
  },
  sttProvider: true,
  _count: { select: { messages: true, chatCompletions: true } },
};

export const chatsRoutes = new Elysia({ prefix: '/chats' })

  .use(jwtGuard)

  /* ── GET /chats ──────────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where = { userId: user.userId };

    const [items, total] = await prisma.$transaction([
      prisma.chat.findMany({ skip, take, where, include: chatListInclude, orderBy: { createdAt: 'desc' } }),
      prisma.chat.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /chats/:id ──────────────────────────────────────────── */
  .get('/:id', async ({ user, params, set }) => {
    const item = await prisma.chat.findUnique({ where: { id: params.id }, include: chatDetailInclude });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  /* ── GET /chats/:id/system-prompt ──────────────────────────────── */
  .get('/:id/system-prompt', async ({ user, params, set }) => {
    const chat = await prisma.chat.findUnique({ where: { id: params.id } });
    if (!chat) { set.status = 404; return 'Not found'; }
    if (chat.userId !== user.userId && user.role !== 'ADMIN') { set.status = 404; return 'Not found'; }

    const cacheKey = `chatSystemPrompt:${chat.id}`;
    const promptText = await redisConnection.get(cacheKey);

    if (!promptText) { set.status = 404; return 'System prompt not cached yet.'; }

    set.headers['content-type'] = 'text/plain';
    return promptText;
  })

  /* ── POST /chats ─────────────────────────────────────────────── */
  .post('/', async ({ user, body, set }) => {
    const character = await prisma.character.findUnique({ where: { id: body.characterId } });
    if (!character) { set.status = 404; return { error: 'Character not found' }; }

    const chat = await model.chat.create({
      data: {
        user: { connect: { id: user.userId } },
        character: { connect: { id: body.characterId } },
        ...(body.tts !== undefined ? { tts: body.tts } : {}),
      },
      include: chatDetailInclude,
    });

    // Create greeting message if the character has one
    if (character.greeting) {
      await model.message.create({
        data: {
          role: 'ASSISTANT',
          content: character.greeting,
          chat: { connect: { id: chat.id } },
          user: { connect: { id: user.userId } },
        },
      });
    }
    return chat;
  }, {
    body: Body({
      characterId: t.String(),
      tts: t.Optional(t.Boolean()),
    }),
  })

  /* ── PATCH /chats/:id ────────────────────────────────────────── */
  .patch('/:id', async ({ user, params, body, set }) => {
    const item = await prisma.chat.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }

    const original = item;
    const { sttProviderId, characterId, ...rest } = body;

    if (characterId) {
      const character = await prisma.character.findUnique({ where: { id: characterId } });
      if (!character) { set.status = 404; return { error: 'Character not found' }; }
    }
    if (sttProviderId) {
      const sttProvider = await prisma.sttProvider.findUnique({ where: { id: sttProviderId } });
      if (!sttProvider) { set.status = 404; return { error: 'STT Provider not found' }; }
    }

    const updated = await model.chat.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(sttProviderId ? { sttProvider: { connect: { id: sttProviderId } } } : {}),
        ...(characterId ? { character: { connect: { id: characterId } } } : {}),
      },
      include: chatDetailInclude,
    }, original);
    return updated;
  }, {
    body: Body({
      characterId: t.Optional(t.String()),
      sttProviderId: t.Optional(t.String()),
      tts: t.Optional(t.Boolean()),
      action: t.Optional(t.Union([t.Literal('Init'), t.Literal('RefreshSystemPrompt'), t.Literal('Summarize'), t.Literal('Nothing')])),
    }),
  })

  /* ── DELETE /chats/:id ───────────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.chat.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    return model.chat.delete({ where: { id: params.id } });
  });
