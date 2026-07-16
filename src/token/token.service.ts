import { ethers, type TransactionResponse } from 'ethers';
import { Decimal } from '@prisma/client/runtime/library';
import type { TokenPermit } from '@prisma/client';
import { UsdcAbi } from './UsdcAbi';
import { withLock } from '../queue/lock';
import { redisConnection } from '../queue/connection';

const RPC_URL = process.env.RPC_URL;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MASTER_WALLET_ADDRESS = process.env.MASTER_WALLET_ADDRESS!;
const MASTER_WALLET_PRIVATE_KEY = process.env.MASTER_WALLET_PRIVATE_KEY!;

let contract: ethers.Contract;
let signer: ethers.Wallet;

const BLOCKCHAIN_LOCK = 'blockchain';
const NONCE_KEY = 'blockchain:nonce';

function getContract(): ethers.Contract {
  if (!contract) {
    if (!RPC_URL) throw new Error('RPC_URL not set');
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    signer = new ethers.Wallet(MASTER_WALLET_PRIVATE_KEY, provider);
    contract = new ethers.Contract(TOKEN_ADDRESS, UsdcAbi, signer);
  }
  return contract;
}

function getSigner(): ethers.Wallet {
  getContract();
  return signer;
}

/** Get next nonce from Redis (or seed from chain if not set), then increment. */
async function nextNonce(): Promise<number> {
  const s = getSigner();
  const stored = await redisConnection.get(NONCE_KEY);
  if (stored !== null) {
    await redisConnection.incr(NONCE_KEY);
    return parseInt(stored);
  }
  // First time — seed from chain
  const chainNonce = await s.getNonce('latest');
  await redisConnection.set(NONCE_KEY, chainNonce + 1);
  return chainNonce;
}

/** Reset Redis nonce to chain state. Called by watcher on nonce errors. */
export async function resetNonce(): Promise<void> {
  const s = getSigner();
  const chainNonce = await s.getNonce('latest');
  await redisConnection.set(NONCE_KEY, chainNonce);
  console.log(`[token] Nonce reset to ${chainNonce}`);
}

/** True for errors that mean our managed nonce drifted from the chain — nonce
 *  too low/high, replacement underpriced, or Base's delegated-account
 *  "gapped-nonce" rejection. */
function isNonceError(err: any): boolean {
  const msg = (err?.message ?? err?.info?.error?.message ?? String(err)).toLowerCase();
  return /nonce/.test(msg) || err?.code === 'NONCE_EXPIRED' || err?.code === 'REPLACEMENT_UNDERPRICED';
}

/** Base rejects a 2nd unmined tx from an EIP-7702 delegated account. */
function isInFlightLimit(err: any): boolean {
  const msg = (err?.message ?? err?.info?.error?.message ?? String(err)).toLowerCase();
  return /in-flight transaction limit/.test(msg);
}

/**
 * Send a populated tx with the Redis-managed nonce. If it fails with a nonce
 * error (drift from chain — e.g. after dropped/failed sends), resetNonce() to
 * re-sync with the chain and run the send again once. A blind Redis increment
 * on every attempt is what lets the nonce gap in the first place; this makes
 * the send self-heal instead of the operator having to reset Redis by hand.
 */
async function sendManaged(txRequest: ethers.TransactionRequest, label: string): Promise<TransactionResponse> {
  const s = getSigner();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const nonce = await nextNonce();
    let tx: TransactionResponse;
    try {
      const gasLimit = ((await s.estimateGas({ ...txRequest, nonce })) * 12n) / 10n;
      tx = await s.sendTransaction({ ...txRequest, nonce, gasLimit });
    } catch (err: any) {
      lastErr = err;
      console.error(`[token] ${label} send failed (nonce=${nonce}): ${err?.message ?? err}`);
      // Nonce drift → re-sync and run again. "in-flight limit reached" means a
      // previous tx is still unmined; reset+retry (this call is lock-serialized,
      // so backing off and re-reading the chain nonce clears it).
      if ((isNonceError(err) || isInFlightLimit(err)) && attempt < 2) {
        await resetNonce();
        if (isInFlightLimit(err)) await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      throw err;
    }
    console.log(`[token] ${label} sent: ${tx.hash} nonce=${nonce}`);
    // The master wallet is an EIP-7702 delegated account: Base rejects a second
    // in-flight tx and any gapped nonce. Wait for this tx to mine before
    // returning (and releasing the blockchain lock) so the next send starts
    // from a clean chain nonce with nothing pending — and so callers that
    // trigger a chain refresh afterwards see the effect already applied.
    await tx.wait(1);
    return tx;
  }
  throw lastErr;
}

export async function getNonce(address: string): Promise<bigint> {
  return getContract().nonces(address);
}

export async function getAllowance(owner: string): Promise<Decimal> {
  return withLock(BLOCKCHAIN_LOCK, async () => {
    const c = getContract();
    const decimals = await c.decimals();
    const allowance = await c.allowance(owner, MASTER_WALLET_ADDRESS);
    return new Decimal(ethers.formatUnits(allowance, decimals));
  });
}

export async function getBalance(address: string): Promise<Decimal> {
  return withLock(BLOCKCHAIN_LOCK, async () => {
    const c = getContract();
    const decimals = await c.decimals();
    const balance = await c.balanceOf(address);
    return new Decimal(ethers.formatUnits(balance, decimals));
  });
}

export async function permit(tokenPermit: TokenPermit): Promise<string> {
  return withLock(BLOCKCHAIN_LOCK, async () => {
    const c = getContract();
    const { owner, value, deadline, v, r, s: sig } = tokenPermit;

    console.log(`[token] Sending permit from ${owner} for spender ${MASTER_WALLET_ADDRESS}`);

    const txRequest = await c.permit.populateTransaction(
      owner, MASTER_WALLET_ADDRESS, value, deadline, v, r, sig,
    );

    const tx = await sendManaged(txRequest, `permit ${owner}`);
    return tx.hash;
  });
}

export async function transferFromTo(from: string, to: string, amountTokens: string): Promise<TransactionResponse> {
  return withLock(BLOCKCHAIN_LOCK, async () => {
    const c = getContract();
    const decimals = await c.decimals();
    const amount = ethers.parseUnits(amountTokens, decimals);

    const txReq = await c.transferFrom.populateTransaction(from, to, amount);
    console.log(`[token] transferFrom ${from} → ${to} amount=${amountTokens}`);
    return sendManaged(txReq, `transferFrom ${from}→${to}`);
  });
}
