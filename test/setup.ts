import { execSync } from 'child_process';

const RPC_URL = process.env.RPC_URL;
const USDC_ADDRESS = process.env.TOKEN_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_WHALE = '0x20FE51A9229EEf2cF8Ad9E89d91CAb9312cF3b7A';

let snapshotId: string | null = null;

async function resetPostgres() {
  execSync('bunx prisma db push --force-reset', { stdio: 'inherit' });
}

async function resetRedis() {
  const host = process.env.REDIS_HOST ?? 'localhost';
  try {
    execSync(`redis-cli -h ${host} -p 6379 FLUSHALL`, { stdio: 'inherit' });
  } catch {
    console.warn('redis-cli not available, skipping Redis flush');
  }
}

async function rpcCall(method: string, params: any[] = []): Promise<any> {
  if (!RPC_URL) return null;
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
  });
  const json = (await res.json()) as any;
  return json.result;
}

async function fundTestWalletsWithUsdc() {
  if (!RPC_URL) {
    console.log('No RPC_URL set, skipping blockchain setup');
    return;
  }

  await rpcCall('anvil_impersonateAccount', [USDC_WHALE]);

  const fundWallet = async (to: string, amountUsdc: number) => {
    const amount = BigInt(amountUsdc * 1_000_000).toString(16).padStart(64, '0');
    const toParam = to.slice(2).toLowerCase().padStart(64, '0');
    const data = `0xa9059cbb${toParam}${amount}`;
    await rpcCall('eth_sendTransaction', [{ from: USDC_WHALE, to: USDC_ADDRESS, data }]);
    console.log(`✅ Funded ${to} with ${amountUsdc} USDC`);
  };

  await fundWallet(process.env.MASTER_WALLET_ADDRESS!, 100);
  await fundWallet(process.env.ALICE_WALLET_ADDRESS!, 100);
  await fundWallet(process.env.BOB_WALLET_ADDRESS!, 100);

  await rpcCall('anvil_stopImpersonatingAccount', [USDC_WHALE]);

  const walletsToClean = [
    process.env.MASTER_WALLET_ADDRESS,
    process.env.ALICE_WALLET_ADDRESS,
    process.env.BOB_WALLET_ADDRESS,
    process.env.GUEST_WALLET_ADDRESS,
  ].filter(Boolean);

  for (const addr of walletsToClean) {
    await rpcCall('anvil_setCode', [addr, '0x']);
    console.log(`✅ Cleared code at ${addr}`);
  }
}

async function takeAnvilSnapshot(): Promise<string | null> {
  if (!RPC_URL) return null;
  return rpcCall('evm_snapshot');
}

async function revertAnvilSnapshot(id: string): Promise<boolean> {
  if (!RPC_URL) return false;
  return rpcCall('evm_revert', [id]);
}

export function setBeforeAll() {
  // Increase test timeout — blockchain + TTS operations need more than 5s
  if (typeof globalThis.setDefaultTimeout === 'function') {
    globalThis.setDefaultTimeout(120_000);
  }

  beforeAll(async () => {
    try {
      await resetPostgres();
      await resetRedis();

      if (RPC_URL) {
        await rpcCall('anvil_reset', [{ forking: { jsonRpcUrl: 'https://mainnet.base.org' } }]);
        console.log('✅ Anvil fork reset');
      }

      await fundTestWalletsWithUsdc();
      snapshotId = await takeAnvilSnapshot();
      if (snapshotId) console.log('✅ Snapshot ID:', snapshotId);
      console.log('✅ Database, Redis, and blockchain reset');
    } catch (error) {
      console.error(error);
      throw error;
    }
  });
}

export function setAfterAll() {
  afterAll(async () => {
    try {
      if (snapshotId) {
        const result = await revertAnvilSnapshot(snapshotId);
        console.log('✅ Reverted snapshot:', result);
      }
    } catch (error) {
      console.error(error);
    }
  });
}
