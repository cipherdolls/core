import type { Job } from 'bullmq';
import { Prisma, type TokenPermit } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';
import * as tokenService from '../token/token.service';

const scalarFields = Object.values(Prisma.TokenPermitScalarFieldEnum) as Prisma.TokenPermitScalarFieldEnum[];

class TokenPermitsProcessor extends BaseProcessor<TokenPermit> {
  constructor() {
    super('tokenPermit', scalarFields);
  }

  protected override getTargets(entity: TokenPermit) {
    return { userId: entity.userId ?? undefined };
  }

  protected override async onCreated(_job: Job, permit: TokenPermit): Promise<void> {
    try {
      const txHash = await tokenService.permit(permit);
      await prisma.tokenPermit.update({
        where: { id: permit.id },
        data: { txHash },
      });
      console.log(`[tokenPermit] Permit executed on-chain: ${txHash}`);

      // Trigger user token refresh via queue
      if (permit.userId) {
        await model.user.update({
          where: { id: permit.userId },
          data: { action: 'RefreshTokenBalanceAndAllowance' },
        });
      }
    } catch (error: any) {
      console.error(`[tokenPermit] Permit execution failed: ${error.message}`);
    }
  }
}

export const tokenPermitsProcessor = new TokenPermitsProcessor();
