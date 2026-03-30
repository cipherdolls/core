import { Body, pickFields } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard, optionalJwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { enqueueCreated, enqueueUpdated, enqueueDeleted } from '../queue/enqueue';
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
        include: { picture: true, ttsVoices: { orderBy: [{ recommended: 'desc' }, { name: 'asc' }] }, _count: { select: { ttsVoices: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.ttsProvider.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  .get('/:id', async ({ params, set }) => {
    const item = await prisma.ttsProvider.findUnique({
      where: { id: params.id },
      include: { picture: true, ttsVoices: { orderBy: [{ recommended: 'desc' }, { name: 'asc' }] }, _count: { select: { ttsVoices: true } } },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  .use(jwtGuard)
  .post('/', async ({ user, body, set }) => {
    requireAdmin(user, set);
    const item = await prisma.ttsProvider.create({
      data: { ...body, user: { connect: { id: user.userId } } },
      include: { _count: { select: { ttsVoices: true } } },
    });
    await enqueueCreated('ttsProvider', item);
    return item;
  }, {
    body: Body({
      name: t.String(),
      dollarPerCharacter: t.Optional(t.Number()),
      censored: t.Optional(t.Boolean()),
    }),
  })

  .patch('/:id', async ({ user, params, body, set }) => {
    requireAdmin(user, set);
    const original = await prisma.ttsProvider.findUnique({ where: { id: params.id } });
    if (!original) { set.status = 404; return { error: 'Not found' }; }
    const updated = await prisma.ttsProvider.update({
      where: { id: params.id },
      data: pickFields(body, ['name', 'dollarPerCharacter', 'censored']),
      include: { _count: { select: { ttsVoices: true } } },
    });
    await enqueueUpdated('ttsProvider', updated, original);
    return updated;
  }, {
    body: Body({
      name: t.Optional(t.String()),
      dollarPerCharacter: t.Optional(t.Number()),
      censored: t.Optional(t.Boolean()),
    }),
  })

  .delete('/:id', async ({ user, params, set }) => {
    requireAdmin(user, set);
    const item = await prisma.ttsProvider.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    const deleted = await prisma.ttsProvider.delete({ where: { id: params.id } });
    await enqueueDeleted('ttsProvider', deleted);
    return deleted;
  });
