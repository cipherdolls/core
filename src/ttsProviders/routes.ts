import { Body, pickFields } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard, optionalJwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';

export const ttsProvidersRoutes = new Elysia({ prefix: '/tts-providers' })

  .use(optionalJwtGuard)
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};
    if (query.name) where.name = { contains: query.name, mode: 'insensitive' };

    const [items, total] = await prisma.$transaction([
      prisma.ttsProvider.findMany({
        skip,
        take,
        where,
        include: { picture: true, ttsVoices: { include: { audio: true, _count: { select: { avatars: true } } }, orderBy: [{ recommended: 'desc' }, { name: 'asc' }] }, _count: { select: { ttsVoices: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.ttsProvider.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  .get('/:id', async ({ params, set }) => {
    const item = await prisma.ttsProvider.findUnique({
      where: { id: params.id },
      include: { picture: true, ttsVoices: { include: { audio: true, _count: { select: { avatars: true } } }, orderBy: [{ recommended: 'desc' }, { name: 'asc' }] }, _count: { select: { ttsVoices: true } } },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  .use(jwtGuard)
  .post('/', async ({ user, body, set }) => {
    requireAdmin(user, set);
    const item = await model.ttsProvider.create({
      data: { ...body, user: { connect: { id: user.userId } } },
      include: { _count: { select: { ttsVoices: true } } },
    });
    return item;
  }, {
    body: Body({
      name: t.String(),
      dollarPerCharacter: t.Optional(t.Number()),
      censored: t.Optional(t.Boolean()),
      exampleVoiceText: t.Optional(t.String()),
    }),
  })

  .patch('/:id', async ({ user, params, body, set }) => {
    requireAdmin(user, set);
    const original = await prisma.ttsProvider.findUnique({ where: { id: params.id } });
    if (!original) { set.status = 404; return { error: 'Not found' }; }
    const updated = await model.ttsProvider.update({
      where: { id: params.id },
      data: pickFields(body, ['name', 'dollarPerCharacter', 'censored', 'exampleVoiceText']),
      include: { _count: { select: { ttsVoices: true } } },
    }, original);
    return updated;
  }, {
    body: Body({
      name: t.Optional(t.String()),
      dollarPerCharacter: t.Optional(t.Number()),
      censored: t.Optional(t.Boolean()),
      exampleVoiceText: t.Optional(t.String()),
    }),
  })

  .delete('/:id', async ({ user, params, set }) => {
    requireAdmin(user, set);
    const item = await prisma.ttsProvider.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return model.ttsProvider.delete({ where: { id: params.id } });
  });
