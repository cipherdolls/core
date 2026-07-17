import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';
import { buildPrompt } from '../tti/prompt';

/**
 * Text-to-image jobs: generate a picture for a doll body. The doll body's
 * `appearance` (virtual body, or the real one when connected) anchors the
 * subject; the optional `prompt` adds scene/pose/outfit on top; the house
 * style template (src/tti/prompt.ts) frames everything.
 */

export const ttiJobsRoutes = new Elysia({ prefix: '/tti-jobs' })
  .use(jwtGuard)

  /* ── GET /tti-jobs ─────────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where = {
      ...(user.role === 'ADMIN' ? {} : { userId: user.userId }),
      ...(query.dollBodyId ? { dollBodyId: query.dollBodyId } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.ttiJob.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.ttiJob.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /tti-jobs/:id ─────────────────────────────────────────── */
  .get('/:id', async ({ user, params, set }) => {
    const item = await prisma.ttiJob.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    return item;
  })

  /* ── POST /tti-jobs ── generate a picture for a doll body ─────── */
  .post(
    '/',
    async ({ user, body, set }) => {
      const dollBody = await prisma.dollBody.findUnique({ where: { id: body.dollBodyId } });
      if (!dollBody) { set.status = 404; return { error: 'Doll body not found' }; }
      if (dollBody.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
      if (!dollBody.appearance && !body.prompt) {
        set.status = 400;
        return { error: 'Doll body has no appearance — set one or pass a prompt' };
      }

      const prompt = dollBody.appearance
        ? buildPrompt(dollBody.appearance, body.prompt)
        : buildPrompt(body.prompt!);

      return model.ttiJob.create({
        data: {
          prompt,
          dollBody: { connect: { id: dollBody.id } },
          user: { connect: { id: user.userId } },
          ...(body.seed !== undefined ? { seed: body.seed } : {}),
          ...(body.width !== undefined ? { width: body.width } : {}),
          ...(body.height !== undefined ? { height: body.height } : {}),
        },
      });
    },
    {
      body: Body({
        dollBodyId: t.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }),
        prompt: t.Optional(t.String({ maxLength: 2000 })),
        seed: t.Optional(t.Integer({ minimum: 0 })),
        width: t.Optional(t.Integer({ minimum: 256, maximum: 2048, multipleOf: 16 })),
        height: t.Optional(t.Integer({ minimum: 256, maximum: 2048, multipleOf: 16 })),
      }),
    },
  );
