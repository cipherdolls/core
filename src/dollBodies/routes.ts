import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';

export const dollBodiesRoutes = new Elysia({ prefix: '/doll-bodies' })
  .use(jwtGuard)

  /* ── GET /doll-bodies ──────────────────────────────────────────── */
  .get('/', async ({ query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where = {
      ...(query.avatarId ? { avatarId: query.avatarId } : {}),
      ...(query.virtual !== undefined ? { virtual: query.virtual === 'true' } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.dollBody.findMany({
        where,
        skip,
        take,
        include: { avatar: { include: { picture: true } }, picture: true, _count: { select: { dolls: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.dollBody.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /doll-bodies/:id ──────────────────────────────────────── */
  .get('/:id', async ({ params, set }) => {
    const item = await prisma.dollBody.findUnique({
      where: { id: params.id },
      include: { avatar: { include: { picture: true } }, dolls: true, firmwares: true, picture: true },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  /* ── POST /doll-bodies ─────────────────────────────────────────── */
  .post(
    '/',
    async ({ user, body, set }) => {
      // Virtual bodies (appearance carrier for TTI) can be created by the avatar's
      // owner; physical product bodies stay admin-only.
      if (body.virtual) {
        const avatar = await prisma.avatar.findUnique({ where: { id: body.avatarId } });
        if (!avatar) { set.status = 404; return { error: 'Avatar not found' }; }
        if (avatar.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
      } else {
        requireAdmin(user, set);
      }
      return model.dollBody.create({
        data: {
          name: body.name,
          description: body.description,
          avatar: { connect: { id: body.avatarId } },
          ...(body.appearance !== undefined ? { appearance: body.appearance } : {}),
          ...(body.virtual !== undefined ? { virtual: body.virtual } : {}),
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
        appearance: t.Optional(t.String()),
        virtual: t.Optional(t.Boolean()),
        productUrl: t.Optional(t.String()),
        published: t.Optional(t.Boolean()),
      }),
    },
  )

  /* ── PATCH /doll-bodies/:id ────────────────────────────────────── */
  .patch(
    '/:id',
    async ({ user, params, body, set }) => {
      const item = await prisma.dollBody.findUnique({ where: { id: params.id }, include: { avatar: true } });
      if (!item) { set.status = 404; return { error: 'Not found' }; }
      // Owners manage their avatars' virtual bodies; physical bodies stay admin-only.
      if (item.virtual) {
        if (item.avatar.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
      } else {
        requireAdmin(user, set);
      }
      return model.dollBody.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.appearance !== undefined ? { appearance: body.appearance } : {}),
          ...(body.avatarId !== undefined ? { avatar: { connect: { id: body.avatarId } } } : {}),
          ...(body.productUrl !== undefined ? { productUrl: body.productUrl } : {}),
          ...(body.published !== undefined ? { published: body.published } : {}),
        },
      }, item);
    },
    {
      body: Body({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        appearance: t.Optional(t.String()),
        avatarId: t.Optional(t.String()),
        productUrl: t.Optional(t.String()),
        published: t.Optional(t.Boolean()),
      }),
    },
  )

  /* ── DELETE /doll-bodies/:id ───────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.dollBody.findUnique({ where: { id: params.id }, include: { avatar: true } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.virtual) {
      if (item.avatar.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    } else {
      requireAdmin(user, set);
    }
    return model.dollBody.delete({ where: { id: params.id } });
  });
