import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';

export const apiKeysRoutes = new Elysia({ prefix: '/api-keys' })
  .use(jwtGuard)

  /* ── GET /api-keys ───────────────────────────────────────────── */
  .get('/', async ({ user }) => {
    const keys = await prisma.apiKey.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: keys, meta: { total: keys.length } };
  })

  /* ── POST /api-keys ──────────────────────────────────────────── */
  .post(
    '/',
    async ({ user, body }) => {
      const apiKey = await prisma.apiKey.create({
        data: {
          name: body.name ?? '',
          user: { connect: { id: user.userId } },
        },
      });
      return apiKey;
    },
    {
      body: Body({
        name: t.Optional(t.String({ maxLength: 50 })),
      }),
    },
  )

  /* ── DELETE /api-keys/:id ────────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const apiKey = await prisma.apiKey.findUnique({ where: { id: params.id } });

    if (!apiKey) {
      set.status = 404;
      return { error: 'API key not found' };
    }

    if (apiKey.userId !== user.userId && user.role !== 'ADMIN') {
      set.status = 403;
      return { error: 'Not authorized' };
    }

    await prisma.apiKey.delete({ where: { id: params.id } });
    return { success: true };
  });
