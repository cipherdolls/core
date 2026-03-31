import { Body, pickFields } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard, optionalJwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';

export const embeddingModelsRoutes = new Elysia({ prefix: '/embedding-models' })

  .use(optionalJwtGuard)
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};
    if (query.providerModelName) where.providerModelName = { contains: query.providerModelName, mode: 'insensitive' };
    if (query.aiProviderId) where.aiProviderId = query.aiProviderId;

    const [items, total] = await prisma.$transaction([
      prisma.embeddingModel.findMany({
        skip,
        take,
        where,
        include: { aiProvider: true },
        orderBy: { providerModelName: 'asc' },
      }),
      prisma.embeddingModel.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  .get('/:id', async ({ params, set }) => {
    const item = await prisma.embeddingModel.findUnique({
      where: { id: params.id },
      include: { aiProvider: true },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  .use(jwtGuard)
  .post('/', async ({ user, body, set }) => {
    requireAdmin(user, set);
    const { aiProviderId, ...rest } = body;
    const item = await model.embeddingModel.create({
      data: { ...rest, aiProvider: { connect: { id: aiProviderId } } },
      include: { aiProvider: true },
    });
    return item;
  }, {
    body: Body({
      aiProviderId: t.String(),
      providerModelName: t.String(),
      info: t.Optional(t.String()),
      dollarPerInputToken: t.Optional(t.Number()),
      dollarPerOutputToken: t.Optional(t.Number()),
      recommended: t.Optional(t.Boolean()),
      error: t.Optional(t.Boolean()),
    }),
  })

  .patch('/:id', async ({ user, params, body, set }) => {
    requireAdmin(user, set);
    const item = await prisma.embeddingModel.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    const updated = await model.embeddingModel.update({
      where: { id: params.id },
      data: pickFields(body, ['aiProviderId', 'providerModelName', 'info', 'dollarPerInputToken', 'dollarPerOutputToken', 'recommended', 'error']),
      include: { aiProvider: true },
    }, item);
    return updated;
  }, {
    body: Body({
      aiProviderId: t.Optional(t.String()),
      providerModelName: t.Optional(t.String()),
      info: t.Optional(t.String()),
      dollarPerInputToken: t.Optional(t.Number()),
      dollarPerOutputToken: t.Optional(t.Number()),
      recommended: t.Optional(t.Boolean()),
      error: t.Optional(t.Boolean()),
    }),
  })

  .delete('/:id', async ({ user, params, set }) => {
    requireAdmin(user, set);
    const item = await prisma.embeddingModel.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return prisma.embeddingModel.delete({ where: { id: params.id } });
  });
