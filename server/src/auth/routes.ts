import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { randomBytes } from 'crypto';
import { ethers } from 'ethers';
import { prisma } from '../db';
import { signToken, verifyToken, decodeToken, jwtGuard } from './jwt';

export const authRoutes = new Elysia({ prefix: '/auth' })

  /* ── GET /auth/nonce ─────────────────────────────────────────── */
  .get('/nonce', () => {
    return { nonce: randomBytes(32).toString('hex') };
  })

  /* ── POST /auth/signin ───────────────────────────────────────── */
  .post(
    '/signin',
    async ({ body, query, set }) => {
      const { signedMessage, message, address, name, gender, language } = body;
      const invitedBy = query.invitedBy as string | undefined;

      // Verify signature
      let recoveredAddress: string;
      try {
        recoveredAddress = ethers.verifyMessage(message, signedMessage);
      } catch {
        set.status = 400;
        return { error: 'Invalid signature' };
      }

      // Normalize addresses
      const normalizedRecovered = ethers.getAddress(recoveredAddress);
      const normalizedAddress = ethers.getAddress(address);

      if (normalizedRecovered !== normalizedAddress) {
        set.status = 400;
        return { error: 'Signature does not match address' };
      }

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { signerAddress: normalizedAddress },
      });

      if (!user) {
        // Validate invitation
        if (invitedBy) {
          if (invitedBy === normalizedAddress) {
            set.status = 400;
            return { error: 'Cannot invite yourself' };
          }
          const inviter = await prisma.user.findUnique({ where: { id: invitedBy } });
          if (!inviter) {
            set.status = 400;
            return { error: 'Invalid invitation ID' };
          }
        }

        // First user or master wallet address gets ADMIN role
        const masterWallet = process.env.MASTER_WALLET_ADDRESS;
        const isAdmin = masterWallet
          ? ethers.getAddress(masterWallet) === normalizedAddress
          : (await prisma.user.count()) === 0;

        user = await prisma.user.create({
          data: {
            signerAddress: normalizedAddress,
            name: name ?? 'Adam',
            gender: gender ?? undefined,
            language: language ?? undefined,
            role: isAdmin ? 'ADMIN' : 'USER',
            ...(invitedBy ? { invitedBy: { connect: { id: invitedBy } } } : {}),
          },
        });
      }

      // Update lastSignInAt
      user = await prisma.user.update({
        where: { id: user.id },
        data: { lastSignInAt: new Date() },
      });

      const token = signToken({
        signerAddress: user.signerAddress,
        userId: user.id,
        role: user.role,
      });

      return { token };
    },
    {
      body: Body({
        signedMessage: t.String(),
        message: t.String(),
        address: t.String(),
        name: t.Optional(t.String()),
        gender: t.Optional(t.Union([t.Literal('Male'), t.Literal('Female'), t.Literal('Other')])),
        language: t.Optional(
          t.Union([
            t.Literal('en'), t.Literal('de'), t.Literal('fr'), t.Literal('es'), t.Literal('it'),
            t.Literal('pt'), t.Literal('ru'), t.Literal('ja'), t.Literal('zh'), t.Literal('ko'),
          ]),
        ),
      }),
      query: t.Object({
        invitedBy: t.Optional(t.String()),
      }),
    },
  )

  /* ── POST /auth/verify ───────────────────────────────────────── */
  .use(jwtGuard)
  .post('/verify', ({ headers }) => {
    const token = headers.authorization?.split(' ')[1];
    if (!token) return { token: 'expired' };

    try {
      verifyToken(token);
      return { token: 'valid' };
    } catch {
      const decoded = decodeToken(token);
      if (decoded && decoded.exp && decoded.exp * 1000 < Date.now()) {
        return { token: 'expired' };
      }
      return { token: 'expired' };
    }
  });
