import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';
import { enqueueCreated, enqueueDeleted } from '../queue/enqueue';

export const sponsorshipsRoutes = new Elysia({ prefix: '/sponsorships' })
  .use(jwtGuard)

  /* ── GET /sponsorships ─────────────────────────────────────────── */
  .get('/', async ({ query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};
    if (query.scenarioId) where.scenarioId = query.scenarioId;

    const [items, total] = await prisma.$transaction([
      prisma.sponsorship.findMany({ skip, take, where, include: { scenario: true }, orderBy: { createdAt: 'desc' } }),
      prisma.sponsorship.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /sponsorships/:id ─────────────────────────────────────── */
  .get('/:id', async ({ params, set }) => {
    const item = await prisma.sponsorship.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  /* ── POST /sponsorships ────────────────────────────────────────── */
  .post(
    '/',
    async ({ user, body, set }) => {
      // Check minimum token spendable
      const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
      if (!dbUser || (Number(dbUser.tokenSpendable ?? 0) < 0.1 && user.role !== 'ADMIN')) {
        set.status = 403;
        return { message: 'Insufficient spendable tokens' };
      }

      // Validate scenario exists
      const scenario = await prisma.scenario.findUnique({ where: { id: body.scenarioId } });
      if (!scenario) { set.status = 404; return { message: 'Scenario not found' }; }

      // Prevent self-sponsorship
      if (scenario.userId === user.userId) {
        set.status = 403;
        return { message: 'Cannot sponsor your own scenario' };
      }

      // Check for duplicate sponsorship
      const existing = await prisma.sponsorship.findFirst({
        where: { scenarioId: body.scenarioId, userId: user.userId },
      });
      if (existing) {
        set.status = 403;
        return { message: 'You already sponsor this scenario' };
      }

      const item = await prisma.sponsorship.create({
        data: {
          scenario: { connect: { id: body.scenarioId } },
          user: { connect: { id: user.userId } },
        },
      });
      await enqueueCreated('sponsorship', item);
      return item;
    },
    {
      body: Body({
        scenarioId: t.String(),
      }),
    },
  )

  /* ── DELETE /sponsorships/:id ──────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.sponsorship.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId) {
      set.status = 403;
      return { error: 'Not authorized' };
    }
    await enqueueDeleted('sponsorship', item);
    return prisma.sponsorship.delete({ where: { id: params.id } });
  });
