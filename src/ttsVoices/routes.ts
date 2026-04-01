import { Body, pickFields } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';

export const ttsVoicesRoutes = new Elysia({ prefix: '/tts-voices' })

  .use(jwtGuard)
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};
    if (query.name) where.name = { contains: query.name, mode: 'insensitive' };
    if (query.language) where.language = query.language;
    if (query.gender) where.gender = query.gender;

    const [items, total] = await prisma.$transaction([
      prisma.ttsVoice.findMany({
        skip,
        take,
        where,
        include: { ttsProvider: true, audio: true },
        orderBy: [{ recommended: 'desc' }, { name: 'asc' }],
      }),
      prisma.ttsVoice.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  .get('/:id', async ({ params, set }) => {
    const item = await prisma.ttsVoice.findUnique({
      where: { id: params.id },
      include: { ttsProvider: true, audio: true },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  .post('/', async ({ user, body, set }) => {
    requireAdmin(user, set);
    const { ttsProviderId, ...rest } = body;
    const item = await model.ttsVoice.create({
      data: { ...rest, ttsProvider: { connect: { id: ttsProviderId } } },
      include: { ttsProvider: true, audio: true },
    });
    return item;
  }, {
    body: Body({
      ttsProviderId: t.String(),
      name: t.String(),
      providerVoiceId: t.String(),
      recommended: t.Optional(t.Boolean()),
      preview: t.Optional(t.String()),
      gender: t.Optional(t.String()),
      language: t.Optional(t.String()),
    }),
  })

  .patch('/:id', async ({ user, params, body, set }) => {
    requireAdmin(user, set);
    const original = await prisma.ttsVoice.findUnique({ where: { id: params.id } });
    if (!original) { set.status = 404; return { error: 'Not found' }; }
    const updated = await model.ttsVoice.update({
      where: { id: params.id },
      data: pickFields(body, ['ttsProviderId', 'name', 'providerVoiceId', 'recommended', 'preview', 'gender', 'language']),
      include: { ttsProvider: true, audio: true },
    }, original);
    return updated;
  }, {
    body: Body({
      ttsProviderId: t.Optional(t.String()),
      name: t.Optional(t.String()),
      providerVoiceId: t.Optional(t.String()),
      recommended: t.Optional(t.Boolean()),
      preview: t.Optional(t.String()),
      gender: t.Optional(t.String()),
      language: t.Optional(t.String()),
    }),
  })

  .delete('/:id', async ({ user, params, set }) => {
    requireAdmin(user, set);
    const item = await prisma.ttsVoice.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return model.ttsVoice.delete({ where: { id: params.id } });
  });
