import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard } from '../auth/jwt';

const userSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  role: true,
  name: true,
  character: true,
  gender: true,
  language: true,
  lastSignInAt: true,
  signerAddress: true,
  invitedById: true,
  _count: { select: { invites: true } },
};

function formatUser(user: any) {
  return {
    ...user,
    referralCount: user._count?.invites ?? 0,
    _count: undefined,
  };
}

export const usersRoutes = new Elysia({ prefix: '/users' })
  .use(jwtGuard)

  /* ── GET /users/me ───────────────────────────────────────────── */
  .get('/me', async ({ user }) => {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: userSelect,
    });
    if (!dbUser) throw new Error('User not found');
    return formatUser(dbUser);
  })

  /* ── GET /users/:id ──────────────────────────────────────────── */
  .get('/:id', async ({ user, params, set }) => {
    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: userSelect,
    });
    if (!target) { set.status = 404; return { error: 'User not found' }; }
    if (target.id !== user.userId && user.role !== 'ADMIN') {
      set.status = 403;
      return { error: 'Not authorized' };
    }
    return formatUser(target);
  })

  /* ── PATCH /users/:id ────────────────────────────────────────── */
  .patch(
    '/:id',
    async ({ user, params, body, set }) => {
      const target = await prisma.user.findUnique({ where: { id: params.id } });
      if (!target) {
        set.status = 404;
        return { error: 'User not found' };
      }
      if (target.id !== user.userId && user.role !== 'ADMIN') {
        set.status = 403;
        return { error: 'Not authorized' };
      }

      await model.user.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.character !== undefined ? { character: body.character } : {}),
          ...(body.gender !== undefined ? { gender: body.gender } : {}),
          ...(body.language !== undefined ? { language: body.language } : {}),
        },
      }, target);
      const result = await prisma.user.findUnique({ where: { id: params.id }, select: userSelect });
      return formatUser(result);
    },
    {
      body: Body({
        name: t.Optional(t.String()),
        character: t.Optional(t.String()),
        gender: t.Optional(t.Union([t.Literal('Male'), t.Literal('Female'), t.Literal('Other')])),
        language: t.Optional(
          t.Union([
            t.Literal('en'), t.Literal('de'), t.Literal('fr'), t.Literal('es'), t.Literal('it'),
            t.Literal('pt'), t.Literal('ru'), t.Literal('ja'), t.Literal('zh'), t.Literal('ko'),
          ]),
        ),
      }),
    },
  );
