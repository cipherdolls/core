import { ethers } from 'ethers';
import { prisma, model } from '../db';
import { resetNonce } from './token.service';

const RPC_URL = process.env.RPC_URL;
const POLL_INTERVAL = 5_000;
const RPC_DELAY = 200;

let provider: ethers.JsonRpcProvider;
let running = false;

/** Check pending transactions for receipts and mark them completed. */
async function checkPending(): Promise<void> {
  const pending = await prisma.transaction.findMany({
    where: { txHash: { not: null }, completed: false },
  });

  if (pending.length === 0) return;

  for (const tx of pending) {
    try {
      const receipt = await provider.getTransactionReceipt(tx.txHash!);
      if (!receipt) {
        await new Promise((r) => setTimeout(r, RPC_DELAY));
        continue;
      }

      const gasUsed = receipt.gasUsed ? BigInt(receipt.gasUsed.toString()) : 0n;

      await model.transaction.update({
        where: { id: tx.id },
        data: {
          blockNumber: Number(receipt.blockNumber),
          feeWei: gasUsed,
          feeFormatted: ethers.formatEther(gasUsed),
          completed: true,
        },
      }, tx);

      console.log(`[watcher] ${tx.txHash} confirmed block=${receipt.blockNumber} gas=${gasUsed}`);
    } catch (error: any) {
      console.error(`[watcher] Error checking ${tx.txHash}: ${error.message}`);
      if (error.message?.includes('nonce')) await resetNonce();
      await new Promise((r) => setTimeout(r, RPC_DELAY));
    }
  }
}

async function pollLoop(): Promise<void> {
  while (running) {
    try {
      await checkPending();
    } catch (error: any) {
      console.error(`[watcher] Poll error: ${error.message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
}

export function startWatcher(): void {
  if (running) return;
  if (!RPC_URL) throw new Error('RPC_URL not set');

  running = true;
  provider = new ethers.JsonRpcProvider(RPC_URL);

  pollLoop();

  console.log(`Blockchain watcher started (polling ${RPC_URL})`);
}

export function stopWatcher(): void {
  running = false;
  console.log('Blockchain watcher stopped');
}
