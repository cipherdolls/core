import { Body, pickFields } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard, optionalJwtGuard, verifyToken } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';

const characterInclude = {
  ttsVoice: { include: { ttsProvider: true } },
  chatModel: { include: { aiProvider: true } },
  picture: true,
  _count: { select: { chats: true } },
};

const editableFields = [
  'name', 'shortDesc', 'character', 'introduction', 'greeting', 'language', 'gender',
  'type', 'systemMessage', 'temperature', 'topP', 'frequencyPenalty', 'presencePenalty',
];

export const charactersRoutes = new Elysia({ prefix: '/characters' })

  .use(optionalJwtGuard)

  /* ── GET /characters ─────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};

    if (query.name) where.name = { contains: query.name, mode: 'insensitive' };
    if (query.gender) where.gender = query.gender;
    if (query.recommended === 'true') where.recommended = true;

    if (!user) {
      where.published = true;
    } else if (query.mine === 'true') {
      where.userId = user.userId;
    } else if (query.published === 'true') {
      where.published = true;
    } else {
      where.OR = [{ userId: user.userId }, { published: true }];
    }

    const [items, total] = await prisma.$transaction([
      prisma.character.findMany({ skip, take, where, include: characterInclude, orderBy: [{ recommended: 'desc' }, { name: 'asc' }] }),
      prisma.character.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /characters/:id ─────────────────────────────────────── */
  .get('/:id', async ({ params, set, user, headers }) => {
    let caller = user;
    if (!caller && headers.authorization) {
      const token = headers.authorization.split(' ')[1];
      if (token) { try { caller = verifyToken(token); } catch {} }
    }

    const item = await prisma.character.findUnique({ where: { id: params.id }, include: characterInclude });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    // Private characters: only owner or admin can view
    if (!item.published && (!caller || (item.userId !== caller.userId && caller.role !== 'ADMIN'))) {
      set.status = 403;
      return { error: 'Not authorized' };
    }
    return item;
  })

  .use(jwtGuard)

  /* ── POST /characters ────────────────────────────────────────── */
  .post('/', async ({ user, body, set }) => {
    const { ttsVoiceId, chatModelId, recommended, published, ...rest } = body;

    const ttsVoice = await prisma.ttsVoice.findUnique({ where: { id: ttsVoiceId } });
    if (!ttsVoice) { set.status = 404; return { error: 'TTS voice not found' }; }
    const chatModel = await prisma.chatModel.findUnique({ where: { id: chatModelId } });
    if (!chatModel) { set.status = 404; return { error: 'Chat model not found' }; }

    const item = await model.character.create({
      data: {
        ...pickFields(rest, editableFields),
        published: published ?? false,
        ...(user.role === 'ADMIN' && recommended !== undefined ? { recommended } : {}),
        user: { connect: { id: user.userId } },
        ttsVoice: { connect: { id: ttsVoiceId } },
        chatModel: { connect: { id: chatModelId } },
      },
      include: characterInclude,
    });
    return item;
  }, {
    body: Body({
      name: t.String(),
      systemMessage: t.String(),
      ttsVoiceId: t.String(),
      chatModelId: t.String(),
      shortDesc: t.Optional(t.String()),
      character: t.Optional(t.String()),
      introduction: t.Optional(t.String()),
      greeting: t.Optional(t.String()),
      language: t.Optional(t.String()),
      gender: t.Optional(t.String()),
      type: t.Optional(t.Union([t.Literal('NORMAL'), t.Literal('ROLEPLAY')])),
      temperature: t.Optional(t.Number()),
      topP: t.Optional(t.Number()),
      frequencyPenalty: t.Optional(t.Number()),
      presencePenalty: t.Optional(t.Number()),
      published: t.Optional(t.Boolean()),
      recommended: t.Optional(t.Boolean()),
    }),
  })

  /* ── PATCH /characters/:id ───────────────────────────────────── */
  .patch('/:id', async ({ user, params, body, set }) => {
    const item = await prisma.character.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    if (body.recommended !== undefined && user.role !== 'ADMIN') { set.status = 403; return { error: 'Only admins can set recommended' }; }

    const { ttsVoiceId, chatModelId, recommended, published } = body;

    const updated = await model.character.update({
      where: { id: params.id },
      data: {
        ...pickFields(body, editableFields),
        ...(published !== undefined ? { published } : {}),
        ...(user.role === 'ADMIN' && recommended !== undefined ? { recommended } : {}),
        ...(ttsVoiceId ? { ttsVoice: { connect: { id: ttsVoiceId } } } : {}),
        ...(chatModelId ? { chatModel: { connect: { id: chatModelId } } } : {}),
      },
      include: characterInclude,
    }, item);
    return updated;
  }, {
    body: Body({
      name: t.Optional(t.String()),
      systemMessage: t.Optional(t.String()),
      ttsVoiceId: t.Optional(t.String()),
      chatModelId: t.Optional(t.String()),
      shortDesc: t.Optional(t.String()),
      character: t.Optional(t.String()),
      introduction: t.Optional(t.String()),
      greeting: t.Optional(t.String()),
      language: t.Optional(t.String()),
      gender: t.Optional(t.String()),
      type: t.Optional(t.Union([t.Literal('NORMAL'), t.Literal('ROLEPLAY')])),
      temperature: t.Optional(t.Number()),
      topP: t.Optional(t.Number()),
      frequencyPenalty: t.Optional(t.Number()),
      presencePenalty: t.Optional(t.Number()),
      published: t.Optional(t.Boolean()),
      recommended: t.Optional(t.Boolean()),
    }),
  })

  /* ── DELETE /characters/:id ──────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.character.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    return model.character.delete({ where: { id: params.id } });
  });
