import type { Job } from 'bullmq';
import { Prisma, type Transaction } from '@prisma/client';
import { ethers } from 'ethers';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';
import { enqueueUpdated } from '../queue/enqueue';
import * as tokenService from '../token/token.service';

const scalarFields = Object.values(Prisma.TransactionScalarFieldEnum) as Prisma.TransactionScalarFieldEnum[];

class TransactionsProcessor extends BaseProcessor<Transaction> {
  constructor() {
    super('transaction', scalarFields);
  }

  protected override async getTargets(entity: Transaction) {
    const message = await prisma.message.findUnique({ where: { id: entity.messageId } });
    return { userId: message?.userId };
  }

  protected override async onCreated(_job: Job, transaction: Transaction): Promise<void> {
    if (BigInt(transaction.amountWei.toString()) === 0n) {
      console.log(`[transaction] Skipping zero-amount ${transaction.id}`);
      return;
    }

    const startTime = Date.now();
    const message = await prisma.message.findUnique({ where: { id: transaction.messageId } });

    try {
      const decimals = 6; // USDC
      const amountTokens = ethers.formatUnits(BigInt(transaction.amountWei.toString()), decimals);

      // Fire and forget — send tx, update hash immediately, don't wait for receipt
      const tx = await tokenService.transferFromTo(
        transaction.fromAddress!,
        transaction.toAddress!,
        amountTokens,
      );

      // Update with txHash and enqueue (generates Transaction updated events)
      const original = transaction;
      const updated = await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          txHash: tx.hash,
          nonce: Number(tx.nonce),
          timeTakenMs: Date.now() - startTime,
          error: null,
        },
      });
      await enqueueUpdated('transaction', updated, original);

      console.log(`[transaction] ${transaction.type} sent: ${tx.hash} nonce=${tx.nonce}`);

      // Enqueue user balance refresh (generates User updated events)
      if (message?.userId) {
        const userOriginal = await prisma.user.findUnique({ where: { id: message.userId } });
        const userUpdated = await prisma.user.update({
          where: { id: message.userId },
          data: { action: 'RefreshTokenBalanceAndAllowance' },
        });
        if (userOriginal) {
          await enqueueUpdated('user', userUpdated, userOriginal);
        }
      }

      // Receipt processing is handled by the blockchain watcher
    } catch (error: any) {
      console.error(`[transaction] ${transaction.type} failed: ${error.message}`);
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { error: error.message, timeTakenMs: Date.now() - startTime },
      });
    }
  }
}

export const transactionsProcessor = new TransactionsProcessor();
