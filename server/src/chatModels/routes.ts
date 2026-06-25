import { Body, pickFields } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard, optionalJwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';

const include = { aiProvider: true, _count: { select: { characters: true } } };
const fields = ['aiProviderId', 'providerModelName', 'info', 'contextWindow', 'recommended', 'error'];

export const chatModelsRoutes = new Elysia({ prefix: '/chat-models' })

  .use(optionalJwtGuard)
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};
    const nameFilter = query.providerModelName || query.name;
    if (nameFilter) where.providerModelName = { contains: nameFilter, mode: 'insensitive' };
    if (query.recommended !== undefined) where.recommended = query.recommended === 'true';

    const [items, total] = await prisma.$transaction([
      prisma.chatModel.findMany({ skip, take, where, include, orderBy: { providerModelName: 'asc' } }),
      prisma.chatModel.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  .get('/:id', async ({ params, set }) => {
    const item = await prisma.chatModel.findUnique({ where: { id: params.id }, include });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  .use(jwtGuard)
  .post('/', async ({ user, body, set }) => {
    requireAdmin(user, set);
    const { aiProviderId, ...rest } = body;
    const item = await model.chatModel.create({
      data: { ...rest, aiProvider: { connect: { id: aiProviderId } } },
      include: { aiProvider: true },
    });
    return item;
  }, {
    body: Body({
      aiProviderId: t.String(),
      providerModelName: t.String(),
      info: t.Optional(t.String()),
      contextWindow: t.Optional(t.Number()),
      recommended: t.Optional(t.Boolean()),
      error: t.Optional(t.Boolean()),
    }),
  })

  .patch('/:id', async ({ user, params, body, set }) => {
    requireAdmin(user, set);
    const item = await prisma.chatModel.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    const updated = await model.chatModel.update({
      where: { id: params.id },
      data: pickFields(body, fields),
      include: { aiProvider: true },
    }, item);
    return updated;
  }, {
    body: Body({
      aiProviderId: t.Optional(t.String()),
      providerModelName: t.Optional(t.String()),
      info: t.Optional(t.String()),
      contextWindow: t.Optional(t.Number()),
      recommended: t.Optional(t.Boolean()),
      error: t.Optional(t.Boolean()),
    }),
  })

  .delete('/:id', async ({ user, params, set }) => {
    requireAdmin(user, set);
    const item = await prisma.chatModel.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return prisma.chatModel.delete({ where: { id: params.id } });
  });
