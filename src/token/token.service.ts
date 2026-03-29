import { ethers, type TransactionResponse } from 'ethers';
import { Decimal } from '@prisma/client/runtime/library';
import type { TokenPermit } from '@prisma/client';
import { UsdcAbi } from './UsdcAbi';

const RPC_URL = process.env.RPC_URL;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MASTER_WALLET_ADDRESS = process.env.MASTER_WALLET_ADDRESS!;
const MASTER_WALLET_PRIVATE_KEY = process.env.MASTER_WALLET_PRIVATE_KEY!;

let contract: ethers.Contract;
let signer: ethers.Wallet;

// Nonce mutex — serializes all blockchain sends to prevent nonce collisions
let nonceLock: Promise<void> = Promise.resolve();

async function withNonceLock<T>(fn: () => Promise<T>): Promise<T> {
  const prevLock = nonceLock;
  let releaseLock: () => void;
  nonceLock = new Promise<void>((resolve) => { releaseLock = resolve; });
  await prevLock;
  try {
    const result = await fn();
    releaseLock!();
    return result;
  } catch (error) {
    releaseLock!();
    throw error;
  }
}

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

export async function getNonce(address: string): Promise<bigint> {
  return getContract().nonces(address);
}

export async function getAllowance(owner: string): Promise<Decimal> {
  const c = getContract();
  const decimals = await c.decimals();
  const allowance = await c.allowance(owner, MASTER_WALLET_ADDRESS);
  return new Decimal(ethers.formatUnits(allowance, decimals));
}

export async function getBalance(address: string): Promise<Decimal> {
  const c = getContract();
  const decimals = await c.decimals();
  const balance = await c.balanceOf(address);
  return new Decimal(ethers.formatUnits(balance, decimals));
}

export async function permit(tokenPermit: TokenPermit): Promise<string> {
  return withNonceLock(async () => {
    const c = getContract();
    const s = getSigner();
    const { owner, value, deadline, v, r, s: sig } = tokenPermit;

    console.log(`[token] Sending permit from ${owner} for spender ${MASTER_WALLET_ADDRESS}`);

    const txRequest = await c.permit.populateTransaction(
      owner, MASTER_WALLET_ADDRESS, value, deadline, v, r, sig,
    );

    const nonce = await s.getNonce('latest');
    const gasLimit = ((await s.estimateGas(txRequest)) * 12n) / 10n;

    const tx = await s.sendTransaction({ ...txRequest, nonce, gasLimit });
    console.log(`[token] Permit tx sent: ${tx.hash} nonce=${nonce}`);
    await tx.wait();
    return tx.hash;
  });
}

// Track nonce locally to avoid collisions on rapid fire-and-forget sends
let localNonce: number | null = null;

export async function transferFromTo(from: string, to: string, amountTokens: string): Promise<TransactionResponse> {
  return withNonceLock(async () => {
    const c = getContract();
    const s = getSigner();
    const decimals = await c.decimals();
    const amount = ethers.parseUnits(amountTokens, decimals);

    const txReq = await c.transferFrom.populateTransaction(from, to, amount);

    // Use local nonce tracking to avoid "nonce too low" on rapid sends
    if (localNonce === null) {
      localNonce = await s.getNonce('latest');
    }
    const nonce = localNonce++;

    const gasLimit = ((await s.estimateGas({ ...txReq, nonce })) * 12n) / 10n;

    console.log(`[token] transferFrom ${from} → ${to} amount=${amountTokens} nonce=${nonce}`);
    const tx = await s.sendTransaction({ ...txReq, nonce, gasLimit });
    return tx; // Don't wait — fire and forget
  });
}
