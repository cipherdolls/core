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
    const s = getSigner();
    const { owner, value, deadline, v, r, s: sig } = tokenPermit;

    console.log(`[token] Sending permit from ${owner} for spender ${MASTER_WALLET_ADDRESS}`);

    const txRequest = await c.permit.populateTransaction(
      owner, MASTER_WALLET_ADDRESS, value, deadline, v, r, sig,
    );

    const nonce = await nextNonce();
    const gasLimit = ((await s.estimateGas(txRequest)) * 12n) / 10n;

    const tx = await s.sendTransaction({ ...txRequest, nonce, gasLimit });
    console.log(`[token] Permit tx sent: ${tx.hash} nonce=${nonce}`);

    return tx.hash;
  });
}

export async function transferFromTo(from: string, to: string, amountTokens: string): Promise<TransactionResponse> {
  return withLock(BLOCKCHAIN_LOCK, async () => {
    const c = getContract();
    const s = getSigner();
    const decimals = await c.decimals();
    const amount = ethers.parseUnits(amountTokens, decimals);

    const txReq = await c.transferFrom.populateTransaction(from, to, amount);
    const nonce = await nextNonce();
    const gasLimit = ((await s.estimateGas({ ...txReq, nonce })) * 12n) / 10n;

    console.log(`[token] transferFrom ${from} → ${to} amount=${amountTokens} nonce=${nonce}`);
    const tx = await s.sendTransaction({ ...txReq, nonce, gasLimit });

    return tx;
  });
}
