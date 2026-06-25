import { Body, pickFields } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
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
    return model.sttProvider.create({
      data: { ...body, user: { connect: { id: user.userId } } },
    });
  }, {
    body: Body({
      name: t.String(),
      recommended: t.Optional(t.Boolean()),
    }),
  })

  .patch('/:id', async ({ user, params, body, set }) => {
    requireAdmin(user, set);
    const item = await prisma.sttProvider.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return model.sttProvider.update({ where: { id: params.id }, data: pickFields(body, ['name', 'recommended']) }, item);
  }, {
    body: Body({
      name: t.Optional(t.String()),
      recommended: t.Optional(t.Boolean()),
    }),
  })

  .delete('/:id', async ({ user, params, set }) => {
    requireAdmin(user, set);
    const item = await prisma.sttProvider.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return model.sttProvider.delete({ where: { id: params.id } });
  });
