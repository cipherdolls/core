import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';

export const dollBodiesRoutes = new Elysia({ prefix: '/doll-bodies' })
  .use(jwtGuard)

  /* ── GET /doll-bodies ──────────────────────────────────────────── */
  .get('/', async ({ query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);

    const [items, total] = await prisma.$transaction([
      prisma.dollBody.findMany({
        skip,
        take,
        include: { avatar: true, picture: true, _count: { select: { dolls: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.dollBody.count(),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /doll-bodies/:id ──────────────────────────────────────── */
  .get('/:id', async ({ params, set }) => {
    const item = await prisma.dollBody.findUnique({
      where: { id: params.id },
      include: { avatar: true, dolls: true, firmwares: true, picture: true },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  /* ── POST /doll-bodies ─────────────────────────────────────────── */
  .post(
    '/',
    async ({ user, body, set }) => {
      requireAdmin(user, set);
      return prisma.dollBody.create({
        data: {
          name: body.name,
          description: body.description,
          avatar: { connect: { id: body.avatarId } },
          ...(body.productUrl !== undefined ? { productUrl: body.productUrl } : {}),
          ...(body.published !== undefined ? { published: body.published } : {}),
        },
      });
    },
    {
      body: Body({
        name: t.String(),
        description: t.String(),
        avatarId: t.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }),
        productUrl: t.Optional(t.String()),
        published: t.Optional(t.Boolean()),
      }),
    },
  )

  /* ── PATCH /doll-bodies/:id ────────────────────────────────────── */
  .patch(
    '/:id',
    async ({ user, params, body, set }) => {
      requireAdmin(user, set);
      const item = await prisma.dollBody.findUnique({ where: { id: params.id } });
      if (!item) { set.status = 404; return { error: 'Not found' }; }
      return prisma.dollBody.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.avatarId !== undefined ? { avatar: { connect: { id: body.avatarId } } } : {}),
          ...(body.productUrl !== undefined ? { productUrl: body.productUrl } : {}),
          ...(body.published !== undefined ? { published: body.published } : {}),
        },
      });
    },
    {
      body: Body({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        avatarId: t.Optional(t.String()),
        productUrl: t.Optional(t.String()),
        published: t.Optional(t.Boolean()),
      }),
    },
  )

  /* ── DELETE /doll-bodies/:id ───────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    requireAdmin(user, set);
    const item = await prisma.dollBody.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return prisma.dollBody.delete({ where: { id: params.id } });
  });
