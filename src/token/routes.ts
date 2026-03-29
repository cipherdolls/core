import { Elysia } from 'elysia';
import { jwtGuard } from '../auth/jwt';
import * as tokenService from './token.service';
import { prisma } from '../db';

export const tokenRoutes = new Elysia({ prefix: '/token' })
  .use(jwtGuard)

  /* ── GET /token/balance ────────────────────────────────────────── */
  .get('/balance', async ({ user, query }) => {
    const address = query.address ?? user.signerAddress;
    try {
      const balance = await tokenService.getBalance(address);
      return { balance: Number(balance) };
    } catch {
      return { balance: 0 };
    }
  })

  /* ── GET /token/allowance ──────────────────────────────────────── */
  .get('/allowance', async ({ user, query }) => {
    const address = query.address ?? user.signerAddress;
    try {
      const allowance = await tokenService.getAllowance(address);
      return { allowance: Number(allowance) };
    } catch {
      return { allowance: 0 };
    }
  });
