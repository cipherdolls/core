import { Body, pickFields } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard, optionalJwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';

export const sttProvidersRoutes = new Elysia({ prefix: '/stt-providers' })

  .use(optionalJwtGuard)
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};

    const [items, total] = await prisma.$transaction([
      prisma.sttProvider.findMany({
        skip,
        take,
        where,
        include: { picture: true },
        orderBy: [{ recommended: 'desc' }, { name: 'asc' }],
      }),
      prisma.sttProvider.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  .get('/:id', async ({ params, set }) => {
    const item = await prisma.sttProvider.findUnique({ where: { id: params.id }, include: { picture: true } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  .use(jwtGuard)
  .post('/', async ({ user, body, set }) => {
    requireAdmin(user, set);
    // Auto-compute free flag if not explicitly set
    const free = body.free ?? (body.dollarPerSecond === undefined || body.dollarPerSecond === 0);
    return prisma.sttProvider.create({
      data: { ...body, free, user: { connect: { id: user.userId } } },
    });
  }, {
    body: Body({
      name: t.String(),
      recommended: t.Optional(t.Boolean()),
      dollarPerSecond: t.Optional(t.Number()),
      free: t.Optional(t.Boolean()),
    }),
  })

  .patch('/:id', async ({ user, params, body, set }) => {
    requireAdmin(user, set);
    const item = await prisma.sttProvider.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    // Auto-compute free flag when dollarPerSecond changes
    const data = pickFields(body, ['name', 'recommended', 'dollarPerSecond', 'free']);
    if (body.dollarPerSecond !== undefined && body.free === undefined) {
      data.free = body.dollarPerSecond === 0;
    }
    return prisma.sttProvider.update({ where: { id: params.id }, data });
  }, {
    body: Body({
      name: t.Optional(t.String()),
      recommended: t.Optional(t.Boolean()),
      dollarPerSecond: t.Optional(t.Number()),
      free: t.Optional(t.Boolean()),
    }),
  })

  .delete('/:id', async ({ user, params, set }) => {
    requireAdmin(user, set);
    const item = await prisma.sttProvider.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return prisma.sttProvider.delete({ where: { id: params.id } });
  });
