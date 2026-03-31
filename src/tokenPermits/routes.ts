import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';

export const tokenPermitsRoutes = new Elysia({ prefix: '/token-permits' })
  .use(jwtGuard)

  /* ── GET /token-permits ────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where = { userId: user.userId };

    const [items, total] = await prisma.$transaction([
      prisma.tokenPermit.findMany({ skip, take, where, orderBy: { createdAt: 'desc' } }),
      prisma.tokenPermit.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /token-permits/:id ────────────────────────────────────── */
  .get('/:id', async ({ user, params, set }) => {
    const item = await prisma.tokenPermit.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId) {
      set.status = 403;
      return { error: 'Not authorized' };
    }
    return item;
  })

  /* ── POST /token-permits ───────────────────────────────────────── */
  .post(
    '/',
    async ({ user, body }) => {
      const item = await model.tokenPermit.create({
        data: {
          owner: body.owner,
          spender: body.spender,
          value: body.value,
          nonce: body.nonce,
          deadline: body.deadline,
          v: body.v,
          r: body.r,
          s: body.s,
          user: { connect: { id: user.userId } },
        },
      });
      return item;
    },
    {
      body: Body({
        owner: t.String(),
        spender: t.String(),
        value: t.String(),
        nonce: t.String(),
        deadline: t.Numeric(),
        v: t.Numeric(),
        r: t.String(),
        s: t.String(),
      }),
    },
  );
