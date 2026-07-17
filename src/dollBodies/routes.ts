import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';

/**
 * Doll bodies are PHYSICAL hardware products: real photos, hardware
 * description, firmwares. The character's look (appearance, generated
 * pictures) lives on the avatar.
 */
export const dollBodiesRoutes = new Elysia({ prefix: '/doll-bodies' })
  .use(jwtGuard)

  /* ── GET /doll-bodies ──────────────────────────────────────────── */
  .get('/', async ({ query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where = {
      ...(query.avatarId ? { avatarId: query.avatarId } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.dollBody.findMany({
        where,
        skip,
        take,
        include: { avatar: { include: { pictures: { orderBy: { createdAt: 'desc' as const } } } }, pictures: { orderBy: { createdAt: 'desc' } }, _count: { select: { dolls: true } } },
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
      include: { avatar: { include: { pictures: { orderBy: { createdAt: 'desc' as const } } } }, dolls: true, firmwares: true, pictures: { orderBy: { createdAt: 'desc' } } },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  /* ── POST /doll-bodies ─────────────────────────────────────────── */
  .post(
    '/',
    async ({ user, body, set }) => {
      requireAdmin(user, set);
      const avatar = await prisma.avatar.findUnique({ where: { id: body.avatarId } });
      if (!avatar) { set.status = 404; return { error: 'Avatar not found' }; }
      return model.dollBody.create({
        data: {
          name: body.name,
          description: body.description,
          avatar: { connect: { id: body.avatarId } },
          // The owner is the avatar's creator, so creators see their bodies.
          user: { connect: { id: avatar.userId } },
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
      return model.dollBody.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
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
    return model.dollBody.delete({ where: { id: params.id } });
  });
