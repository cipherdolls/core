import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';

/**
 * Image styles (admin-curated). A style's `template` frames the generation
 * prompt around a {subject} placeholder and carries composition directives
 * (e.g. eyes at the vertical center) so square center-crops keep the face.
 */
export const ttiStylesRoutes = new Elysia({ prefix: '/tti-styles' })
  .use(jwtGuard)

  /* ── GET /tti-styles ───────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where = user.role === 'ADMIN' ? {} : { published: true };
    const [items, total] = await prisma.$transaction([
      prisma.ttiStyle.findMany({ where, skip, take, orderBy: { createdAt: 'asc' } }),
      prisma.ttiStyle.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /tti-styles/:id ───────────────────────────────────────── */
  .get('/:id', async ({ user, params, set }) => {
    const item = await prisma.ttiStyle.findUnique({ where: { id: params.id } });
    if (!item || (!item.published && user.role !== 'ADMIN')) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  /* ── POST /tti-styles ──────────────────────────────────────────── */
  .post(
    '/',
    async ({ user, body, set }) => {
      requireAdmin(user, set);
      if (!body.template.includes('{subject}')) {
        set.status = 400;
        return { error: 'Template must contain the {subject} placeholder' };
      }
      return model.ttiStyle.create({
        data: {
          name: body.name,
          template: body.template,
          user: { connect: { id: user.userId } },
          ...(body.width !== undefined ? { width: body.width } : {}),
          ...(body.height !== undefined ? { height: body.height } : {}),
          ...(body.published !== undefined ? { published: body.published } : {}),
          ...(body.recommended !== undefined ? { recommended: body.recommended } : {}),
        },
      });
    },
    {
      body: Body({
        name: t.String(),
        template: t.String({ maxLength: 2000 }),
        width: t.Optional(t.Integer({ minimum: 256, maximum: 2048, multipleOf: 16 })),
        height: t.Optional(t.Integer({ minimum: 256, maximum: 2048, multipleOf: 16 })),
        published: t.Optional(t.Boolean()),
        recommended: t.Optional(t.Boolean()),
      }),
    },
  )

  /* ── PATCH /tti-styles/:id ─────────────────────────────────────── */
  .patch(
    '/:id',
    async ({ user, params, body, set }) => {
      requireAdmin(user, set);
      const item = await prisma.ttiStyle.findUnique({ where: { id: params.id } });
      if (!item) { set.status = 404; return { error: 'Not found' }; }
      if (body.template !== undefined && !body.template.includes('{subject}')) {
        set.status = 400;
        return { error: 'Template must contain the {subject} placeholder' };
      }
      return model.ttiStyle.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.template !== undefined ? { template: body.template } : {}),
          ...(body.width !== undefined ? { width: body.width } : {}),
          ...(body.height !== undefined ? { height: body.height } : {}),
          ...(body.published !== undefined ? { published: body.published } : {}),
          ...(body.recommended !== undefined ? { recommended: body.recommended } : {}),
        },
      }, item);
    },
    {
      body: Body({
        name: t.Optional(t.String()),
        template: t.Optional(t.String({ maxLength: 2000 })),
        width: t.Optional(t.Integer({ minimum: 256, maximum: 2048, multipleOf: 16 })),
        height: t.Optional(t.Integer({ minimum: 256, maximum: 2048, multipleOf: 16 })),
        published: t.Optional(t.Boolean()),
        recommended: t.Optional(t.Boolean()),
      }),
    },
  )

  /* ── DELETE /tti-styles/:id ────────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    requireAdmin(user, set);
    const item = await prisma.ttiStyle.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return model.ttiStyle.delete({ where: { id: params.id } });
  });
