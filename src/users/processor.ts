import type { Job } from 'bullmq';
import { Prisma, type User } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';
import * as tokenService from '../token/token.service';

const scalarFields = Object.values(Prisma.UserScalarFieldEnum) as Prisma.UserScalarFieldEnum[];

function calcSpendable(balance?: Decimal | null, allowance?: Decimal | null): Decimal {
  const zero = new Decimal(0);
  if (!balance || !allowance) return zero;
  const bal = new Decimal(balance.toString());
  const allow = new Decimal(allowance.toString());
  if (bal.lte(0) || allow.lte(0)) return zero;
  return bal.lessThan(allow) ? bal : allow;
}

class UsersProcessor extends BaseProcessor<User> {
  constructor() {
    super('user', scalarFields);
  }

  protected override getTargets(user: User) {
    return { userId: user.id };
  }

  protected override getFieldHandlers(job: Job, user: User) {
    return {
      action: async () => {
        switch (user.action) {
          case 'RefreshTokenBalance':
            await this.refreshTokenBalance(user);
            break;
          case 'RefreshTokenAllowance':
            await this.refreshTokenAllowance(user);
            break;
          case 'RefreshTokenBalanceAndAllowance':
            await this.refreshTokenBalanceAndAllowance(user);
            break;
          case 'Nothing':
            return;
        }
      },
      tokenSpendable: async () => {
        await this.removeExpiredSponsorships(user);
      },
    };
  }

  private async removeExpiredSponsorships(user: User): Promise<void> {
    const spendable = Number(user.tokenSpendable ?? 0);
    if (spendable >= 1) return;

    const sponsorships = await prisma.sponsorship.findMany({ where: { userId: user.id } });
    if (sponsorships.length === 0) return;

    console.log(`[user] tokenSpendable below 1 (${spendable}) for ${user.id} — removing ${sponsorships.length} sponsorship(s)`);
    for (const sponsorship of sponsorships) {
      await model.sponsorship.delete({ where: { id: sponsorship.id } });
    }
  }

  private async refreshTokenBalance(user: User): Promise<void> {
    try {
      const tokenBalance = await tokenService.getBalance(user.signerAddress);
      const tokenSpendable = calcSpendable(tokenBalance, user.tokenAllowance);
      await model.user.update({
        where: { id: user.id },
        data: { tokenBalance, tokenSpendable, action: 'Nothing' },
      }, user);
      console.log(`[user] Refreshed balance for ${user.id}: ${tokenBalance}`);
    } catch (error: any) {
      console.error(`[user] Failed to refresh balance: ${error.message}`);
      await prisma.user.update({ where: { id: user.id }, data: { action: 'Nothing' } });
    }
  }

  private async refreshTokenAllowance(user: User): Promise<void> {
    try {
      const tokenAllowance = await tokenService.getAllowance(user.signerAddress);
      const tokenSpendable = calcSpendable(user.tokenBalance, tokenAllowance);
      await model.user.update({
        where: { id: user.id },
        data: { tokenAllowance, tokenSpendable, action: 'Nothing' },
      }, user);
      console.log(`[user] Refreshed allowance for ${user.id}: ${tokenAllowance}`);
    } catch (error: any) {
      console.error(`[user] Failed to refresh allowance: ${error.message}`);
      await prisma.user.update({ where: { id: user.id }, data: { action: 'Nothing' } });
    }
  }

  private async refreshTokenBalanceAndAllowance(user: User): Promise<void> {
    try {
      const tokenBalance = await tokenService.getBalance(user.signerAddress);
      const tokenAllowance = await tokenService.getAllowance(user.signerAddress);
      const tokenSpendable = calcSpendable(tokenBalance, tokenAllowance);
      await model.user.update({
        where: { id: user.id },
        data: { tokenBalance, tokenAllowance, tokenSpendable, action: 'Nothing' },
      }, user);
      console.log(`[user] Refreshed balance+allowance for ${user.id}: balance=${tokenBalance} allowance=${tokenAllowance} spendable=${tokenSpendable}`);
    } catch (error: any) {
      console.error(`[user] Failed to refresh balance+allowance: ${error.message}`);
      await prisma.user.update({ where: { id: user.id }, data: { action: 'Nothing' } });
    }
  }
}

export const usersProcessor = new UsersProcessor();
