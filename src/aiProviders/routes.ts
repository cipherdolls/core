import { Body, pickFields } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard, optionalJwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';

/** Strip sensitive fields from AiProvider responses */
function stripApiKey({ apiKey, ...rest }: any) {
  return rest;
}

export const aiProvidersRoutes = new Elysia({ prefix: '/ai-providers' })

  .use(optionalJwtGuard)
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};
    if (query.name) where.name = { contains: query.name, mode: 'insensitive' };

    const [items, total] = await prisma.$transaction([
      prisma.aiProvider.findMany({ skip, take, where, include: { _count: { select: { chatModels: true, embeddingModels: true, reasoningModels: true } } }, orderBy: { name: 'asc' } }),
      prisma.aiProvider.count({ where }),
    ]);
    return { data: items.map(stripApiKey), meta: paginationMeta(total, pageNum, take) };
  })

  .get('/:id', async ({ params, set }) => {
    const item = await prisma.aiProvider.findUnique({
      where: { id: params.id },
      include: {
        chatModels: true,
        embeddingModels: true,
        reasoningModels: true,
        _count: { select: { chatModels: true, embeddingModels: true, reasoningModels: true } },
      },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return stripApiKey(item);
  })

  .use(jwtGuard)
  .post('/', async ({ user, body, set }) => {
    requireAdmin(user, set);
    const item = await prisma.aiProvider.create({ data: { ...body, user: { connect: { id: user.userId } } } });
    return stripApiKey(item);
  }, {
    body: Body({
      name: t.String(),
      apiKey: t.String(),
      basePath: t.String(),
    }),
  })

  .patch('/:id', async ({ user, params, body, set }) => {
    requireAdmin(user, set);
    const item = await prisma.aiProvider.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    const updated = await prisma.aiProvider.update({ where: { id: params.id }, data: pickFields(body, ['name', 'apiKey', 'basePath']) });
    return stripApiKey(updated);
  }, {
    body: Body({
      name: t.Optional(t.String()),
      apiKey: t.Optional(t.String()),
      basePath: t.Optional(t.String()),
    }),
  })

  .delete('/:id', async ({ user, params, set }) => {
    requireAdmin(user, set);
    const item = await prisma.aiProvider.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    const deleted = await prisma.aiProvider.delete({ where: { id: params.id } });
    return stripApiKey(deleted);
  });
