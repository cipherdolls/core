import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { enqueueUpdated } from '../queue/enqueue';

const userSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  role: true,
  action: true,
  name: true,
  character: true,
  gender: true,
  language: true,
  lastSignInAt: true,
  signerAddress: true,
  tokenBalance: true,
  tokenAllowance: true,
  tokenSpendable: true,
  invitedById: true,
  _count: { select: { invites: true } },
};

function formatUser(user: any) {
  return {
    ...user,
    tokenBalance: user.tokenBalance ? Number(user.tokenBalance) : 0,
    tokenAllowance: user.tokenAllowance ? Number(user.tokenAllowance) : 0,
    tokenSpendable: user.tokenSpendable ? Number(user.tokenSpendable) : 0,
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

      const updated = await prisma.user.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.gender !== undefined ? { gender: body.gender } : {}),
          ...(body.language !== undefined ? { language: body.language } : {}),
          ...(body.signerAddress !== undefined ? { signerAddress: body.signerAddress } : {}),
          ...(body.action !== undefined ? { action: body.action } : {}),
          ...(body.tokenBalance !== undefined ? { tokenBalance: body.tokenBalance } : {}),
          ...(body.tokenAllowance !== undefined ? { tokenAllowance: body.tokenAllowance } : {}),
          ...(body.tokenSpendable !== undefined ? { tokenSpendable: body.tokenSpendable } : {}),
        },
      });
      await enqueueUpdated('user', updated, target);
      const result = await prisma.user.findUnique({ where: { id: params.id }, select: userSelect });
      return formatUser(result);
    },
    {
      body: Body({
        name: t.Optional(t.String()),
        gender: t.Optional(t.Union([t.Literal('Male'), t.Literal('Female'), t.Literal('Other')])),
        language: t.Optional(
          t.Union([
            t.Literal('en'), t.Literal('de'), t.Literal('fr'), t.Literal('es'), t.Literal('it'),
            t.Literal('pt'), t.Literal('ru'), t.Literal('ja'), t.Literal('zh'), t.Literal('ko'),
          ]),
        ),
        signerAddress: t.Optional(t.String()),
        action: t.Optional(
          t.Union([
            t.Literal('RefreshTokenBalance'),
            t.Literal('RefreshTokenAllowance'),
            t.Literal('RefreshTokenBalanceAndAllowance'),
            t.Literal('Nothing'),
          ]),
        ),
        tokenBalance: t.Optional(t.Number()),
        tokenAllowance: t.Optional(t.Number()),
        tokenSpendable: t.Optional(t.Number()),
      }),
    },
  );
