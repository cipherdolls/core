import { Body, pickFields } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard, optionalJwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { enqueueCreated, enqueueUpdated, enqueueDeleted } from '../queue/enqueue';
import { parsePagination, paginationMeta } from '../helpers/pagination';

export const chatModelsRoutes = new Elysia({ prefix: '/chat-models' })

  .use(optionalJwtGuard)
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};
    const nameFilter = query.providerModelName || query.name;
    if (nameFilter) where.providerModelName = { contains: nameFilter, mode: 'insensitive' };
    if (query.recommended !== undefined) where.recommended = query.recommended === 'true';
    if (query.censored !== undefined) where.censored = query.censored === 'true';
    if (query.error !== undefined) where.error = query.error === 'true';

    const [items, total] = await prisma.$transaction([
      prisma.chatModel.findMany({
        skip,
        take,
        where,
        include: { aiProvider: true, _count: { select: { scenarios: true } } },
        orderBy: { providerModelName: 'asc' },
      }),
      prisma.chatModel.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  .get('/:id', async ({ params, set }) => {
    const item = await prisma.chatModel.findUnique({
      where: { id: params.id },
      include: { aiProvider: true, _count: { select: { scenarios: true } } },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  .use(jwtGuard)
  .post('/', async ({ user, body, set }) => {
    requireAdmin(user, set);
    const { aiProviderId, ...rest } = body;
    const item = await prisma.chatModel.create({
      data: { ...rest, aiProvider: { connect: { id: aiProviderId } } },
      include: { aiProvider: true },
    });
    await enqueueCreated('chatModel', item);
    return item;
  }, {
    body: Body({
      aiProviderId: t.String(),
      providerModelName: t.String(),
      info: t.Optional(t.String()),
      dollarPerInputToken: t.Optional(t.Number()),
      dollarPerOutputToken: t.Optional(t.Number()),
      contextWindow: t.Optional(t.Number()),
      recommended: t.Optional(t.Boolean()),
      censored: t.Optional(t.Boolean()),
      free: t.Optional(t.Boolean()),
      error: t.Optional(t.Boolean()),
    }),
  })

  .patch('/:id', async ({ user, params, body, set }) => {
    requireAdmin(user, set);
    const item = await prisma.chatModel.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    const data = pickFields(body, ['aiProviderId', 'providerModelName', 'info', 'dollarPerInputToken', 'dollarPerOutputToken', 'contextWindow', 'recommended', 'censored', 'free', 'error']);
    // Auto-compute free flag when costs change
    if (body.dollarPerInputToken !== undefined || body.dollarPerOutputToken !== undefined) {
      const inputCost = body.dollarPerInputToken ?? Number(item.dollarPerInputToken);
      const outputCost = body.dollarPerOutputToken ?? Number(item.dollarPerOutputToken);
      data.free = inputCost === 0 && outputCost === 0;
    }
    const original = item;
    const updated = await prisma.chatModel.update({
      where: { id: params.id },
      data,
      include: { aiProvider: true },
    });
    await enqueueUpdated('chatModel', updated, original);
    return updated;
  }, {
    body: Body({
      aiProviderId: t.Optional(t.String()),
      providerModelName: t.Optional(t.String()),
      info: t.Optional(t.String()),
      dollarPerInputToken: t.Optional(t.Number()),
      dollarPerOutputToken: t.Optional(t.Number()),
      contextWindow: t.Optional(t.Number()),
      recommended: t.Optional(t.Boolean()),
      censored: t.Optional(t.Boolean()),
      free: t.Optional(t.Boolean()),
      error: t.Optional(t.Boolean()),
    }),
  })

  .delete('/:id', async ({ user, params, set }) => {
    requireAdmin(user, set);
    const item = await prisma.chatModel.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return prisma.chatModel.delete({ where: { id: params.id } });
  });
