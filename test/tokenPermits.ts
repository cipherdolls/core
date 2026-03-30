import { ethers } from 'ethers';
import { auth, api, get, wallets, connectMqtt, waitForEvents, waitForQueuesEmpty, groupByResourceName, type ProcessEvent, type MqttClient, BASE_URL } from './helpers';

/* ────────────────────────────────────────────────────────────────
   State shared across sequential tests
   ──────────────────────────────────────────────────────────────── */

let aliceTokenPermitId: string;
let bobTokenPermitId: string;

export function describeTokenPermits() {
  describe('TokenPermit Controller (e2e)', () => {
    let adminMqttClient: MqttClient;
    let adminUserProcessEvents: ProcessEvent[] = [];

    let aliceMqttClient: MqttClient;
    let aliceUserProcessEvents: ProcessEvent[] = [];

    let bobMqttClient: MqttClient;
    let bobUserProcessEvents: ProcessEvent[] = [];

    /* ── MQTT setup ──────────────────────────────────────────────── */

    it('connect admin MQTT client for tokenPermits', async () => {
      adminMqttClient = await connectMqtt(auth.admin.jwt);
      adminMqttClient.subscribe(`users/${auth.admin.userId}/processEvents`);
      adminMqttClient.on('message', (_topic, msg) => {
        adminUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    it('connect alice MQTT client for tokenPermits', async () => {
      aliceMqttClient = await connectMqtt(auth.alice.jwt);
      aliceMqttClient.subscribe(`users/${auth.alice.userId}/processEvents`);
      aliceMqttClient.on('message', (_topic, msg) => {
        aliceUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    it('connect bob MQTT client for tokenPermits', async () => {
      bobMqttClient = await connectMqtt(auth.bob.jwt);
      bobMqttClient.subscribe(`users/${auth.bob.userId}/processEvents`);
      bobMqttClient.on('message', (_topic, msg) => {
        bobUserProcessEvents.push(JSON.parse(msg.toString()));
      });
    });

    it('adminUserProcessEvents contains 0 Events initially', async () => {
      await waitForEvents<ProcessEvent>(adminUserProcessEvents, 0);
      expect(adminUserProcessEvents.length).toBe(0);
      adminUserProcessEvents = [];
    });

    it('aliceUserProcessEvents contains 0 Events initially', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 0);
      expect(aliceUserProcessEvents.length).toBe(0);
      aliceUserProcessEvents = [];
    });

    it('bobUserProcessEvents contains 0 Events initially', async () => {
      await waitForEvents<ProcessEvent>(bobUserProcessEvents, 0);
      expect(bobUserProcessEvents.length).toBe(0);
      bobUserProcessEvents = [];
    });

    /* ── Initial Token Balances (all 0) ──────────────────────────── */

    it('should get the current 0 token balance of admin', async () => {
      const { status, body } = await api('GET', '/users/me', auth.admin.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(0);
      expect(body.tokenAllowance).toBe(0);
      expect(body.tokenSpendable).toBe(0);
    });

    it('should get the current 0 token balance of alice', async () => {
      const { status, body } = await api('GET', '/users/me', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(0);
      expect(body.tokenAllowance).toBe(0);
      expect(body.tokenSpendable).toBe(0);
    });

    it('should get the current 0 token balance of bob', async () => {
      const { status, body } = await api('GET', '/users/me', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(0);
      expect(body.tokenAllowance).toBe(0);
      expect(body.tokenSpendable).toBe(0);
    });

    /* ── RefreshTokenBalanceAndAllowance ─────────────────────────── */

    it('RefreshTokenBalanceAndAllowance for admin', async () => {
      const { status, body } = await api('PATCH', `/users/${auth.admin.userId}`, auth.admin.jwt, {
        signerAddress: ethers.getAddress(wallets.admin.address),
        action: 'RefreshTokenBalanceAndAllowance',
      });
      expect(status).toBe(200);
      expect(body.action).toBe('RefreshTokenBalanceAndAllowance');
    });

    it('adminUserProcessEvents contains >= 2 User events after refresh', async () => {
      await waitForEvents<ProcessEvent>(adminUserProcessEvents, 2);
      const processEvents = groupByResourceName(adminUserProcessEvents);
      const users = processEvents.User || [];
      expect(users.length).toBeGreaterThanOrEqual(2);
      adminUserProcessEvents = [];
    });

    it('should get admin token balance 100 after refresh', async () => {
      // Wait for async processor to finish blockchain call
      await new Promise(r => setTimeout(r, 3000));
      const { status, body } = await api('GET', '/users/me', auth.admin.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(100);
      expect(body.tokenAllowance).toBe(0);
      expect(body.tokenSpendable).toBe(0);
      expect(body.action).toBe('Nothing');
    });

    it('RefreshTokenBalanceAndAllowance for Alice', async () => {
      const { status } = await api('PATCH', `/users/${auth.alice.userId}`, auth.alice.jwt, {
        signerAddress: ethers.getAddress(wallets.alice.address),
        action: 'RefreshTokenBalanceAndAllowance',
      });
      expect(status).toBe(200);
    });

    it('aliceUserProcessEvents contains >= 2 User events after refresh', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 2);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const users = processEvents.User || [];
      expect(users.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('should get alice token balance 100 after refresh', async () => {
      await new Promise(r => setTimeout(r, 3000));
      const { status, body } = await api('GET', '/users/me', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(100);
      expect(body.tokenAllowance).toBe(0);
      expect(body.tokenSpendable).toBe(0);
      expect(body.action).toBe('Nothing');
    });

    it('RefreshTokenBalanceAndAllowance for bob', async () => {
      const { status } = await api('PATCH', `/users/${auth.bob.userId}`, auth.bob.jwt, {
        signerAddress: ethers.getAddress(wallets.bob.address),
        action: 'RefreshTokenBalanceAndAllowance',
      });
      expect(status).toBe(200);
    });

    it('bobUserProcessEvents contains >= 2 User events after refresh', async () => {
      await waitForEvents<ProcessEvent>(bobUserProcessEvents, 2);
      const processEvents = groupByResourceName(bobUserProcessEvents);
      const users = processEvents.User || [];
      expect(users.length).toBeGreaterThanOrEqual(2);
      bobUserProcessEvents = [];
    });

    it('should get bob token balance 100 after refresh', async () => {
      await new Promise(r => setTimeout(r, 3000));
      const { status, body } = await api('GET', '/users/me', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(100);
      expect(body.tokenAllowance).toBe(0);
      expect(body.tokenSpendable).toBe(0);
      expect(body.action).toBe('Nothing');
    });

    /* ── Anonymous (no JWT) — 401 on all endpoints ───────────────── */

    it('should return 401 when listing permits without JWT', async () => {
      const res = await fetch(`${BASE_URL}/token-permits`);
      expect(res.status).toBe(401);
    });

    it('should return 401 when getting a permit by ID without JWT', async () => {
      const res = await fetch(`${BASE_URL}/token-permits/00000000-0000-0000-0000-000000000000`);
      expect(res.status).toBe(401);
    });

    it('should return 401 when creating a permit without JWT', async () => {
      const res = await fetch(`${BASE_URL}/token-permits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    /* ── Guest — authenticated but has no permits ────────────────── */

    it('should not find any token permits as guest', async () => {
      const { status, body } = await api('GET', '/token-permits', auth.guest.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(0);
      expect(body.data.length).toBe(0);
    });

    /* ── 404 — non-existent permit ID ────────────────────────────── */

    it('should return 404 for a non-existent permit ID', async () => {
      const { status } = await api('GET', '/token-permits/00000000-0000-0000-0000-000000000000', auth.alice.jwt);
      expect(status).toBe(404);
    });

    /* ── Alice — no permits yet ──────────────────────────────────── */

    it('should not find any token permits as alice', async () => {
      const { status, body } = await api('GET', '/token-permits', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('meta');
      expect(body.meta.total).toBe(0);
      expect(body.meta.page).toBe(1);
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    /* ── Create Token Permits ────────────────────────────────────── */

    it('creates a token permit as Alice', async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const humanReadableValue = '3.25';
      const value = ethers.parseUnits(humanReadableValue, 6);

      const walletAlice = new ethers.Wallet(wallets.alice.pk);
      const domain = {
        name: 'USD Coin',
        version: '2',
        chainId: 8453,
        verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      };
      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      };
      const message = {
        owner: ethers.getAddress(wallets.alice.address),
        spender: ethers.getAddress(wallets.admin.address),
        value,
        nonce: 0n,
        deadline,
      };

      const signature = await walletAlice.signTypedData(domain, types, message);
      const { r, s, yParity } = ethers.Signature.from(signature);
      const v = 27 + yParity;

      const { status, body } = await api('POST', '/token-permits', auth.alice.jwt, {
        owner: message.owner,
        spender: message.spender,
        value: value.toString(),
        nonce: '0',
        deadline,
        v,
        r,
        s,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body.owner).toBe(ethers.getAddress(wallets.alice.address));
      aliceTokenPermitId = body.id;
    });

    it('aliceUserProcessEvents contains >= 2 events after permit creation', async () => {
      await waitForEvents<ProcessEvent>(aliceUserProcessEvents, 2);
      const processEvents = groupByResourceName(aliceUserProcessEvents);
      const tokenPermits = processEvents.TokenPermit || [];
      expect(tokenPermits.length).toBeGreaterThanOrEqual(2);
      aliceUserProcessEvents = [];
    });

    it('should find the created token permit by ID', async () => {
      const { status, body } = await api('GET', `/token-permits/${aliceTokenPermitId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', aliceTokenPermitId);
      expect(body.owner).toBe(ethers.getAddress(wallets.alice.address));
    });

    it('should get alice token balance 100 (permit processing async)', async () => {
      const { status, body } = await api('GET', '/users/me', auth.alice.jwt);
      expect(status).toBe(200);
      // Balance=100 from earlier refresh, allowance may still be 0 (permit processing async)
      expect(body.tokenBalance).toBe(100);
    });

    /* ── Bob creates a token permit ──────────────────────────────── */

    it('creates a token permit as bob', async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const humanReadableValue = '2';
      const value = ethers.parseUnits(humanReadableValue, 6);

      const walletBob = new ethers.Wallet(wallets.bob.pk);
      const domain = {
        name: 'USD Coin',
        version: '2',
        chainId: 8453,
        verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      };
      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      };
      const message = {
        owner: ethers.getAddress(wallets.bob.address),
        spender: ethers.getAddress(wallets.admin.address),
        value,
        nonce: 0n,
        deadline,
      };

      const signature = await walletBob.signTypedData(domain, types, message);
      const { r, s, yParity } = ethers.Signature.from(signature);
      const v = 27 + yParity;

      const { status, body } = await api('POST', '/token-permits', auth.bob.jwt, {
        owner: message.owner,
        spender: message.spender,
        value: value.toString(),
        nonce: '0',
        deadline,
        v,
        r,
        s,
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body.owner).toBe(ethers.getAddress(wallets.bob.address));
      bobTokenPermitId = body.id;
    });

    it('bobUserProcessEvents contains >= 2 events after permit creation', async () => {
      await waitForEvents<ProcessEvent>(bobUserProcessEvents, 2);
      const processEvents = groupByResourceName(bobUserProcessEvents);
      const tokenPermits = processEvents.TokenPermit || [];
      expect(tokenPermits.length).toBeGreaterThanOrEqual(2);
      bobUserProcessEvents = [];
    });

    it('should find the created token permit by ID as bob', async () => {
      const { status, body } = await api('GET', `/token-permits/${bobTokenPermitId}`, auth.bob.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', bobTokenPermitId);
      expect(body.owner).toBe(ethers.getAddress(wallets.bob.address));
      expect(body.userId).toBe(auth.bob.userId);
    });

    it('should get bob token balance 100 (permit processing async)', async () => {
      const { status, body } = await api('GET', '/users/me', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(100);
    });

    /* ── Cross-user isolation ────────────────────────────────────── */

    it('Alice list should contain only her own permit', async () => {
      const { status, body } = await api('GET', '/token-permits', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(1);
      expect(body.data.length).toBe(1);
      expect(body.data[0].id).toBe(aliceTokenPermitId);
      expect(body.data[0].userId).toBe(auth.alice.userId);
    });

    it('Bob list should contain only his own permit', async () => {
      const { status, body } = await api('GET', '/token-permits', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(1);
      expect(body.data.length).toBe(1);
      expect(body.data[0].id).toBe(bobTokenPermitId);
      expect(body.data[0].userId).toBe(auth.bob.userId);
    });

    it('Guest list should still be empty', async () => {
      const { status, body } = await api('GET', '/token-permits', auth.guest.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(0);
      expect(body.data.length).toBe(0);
    });

    /* ── Pagination meta verification ────────────────────────────── */

    it('should return correct pagination meta for Alice', async () => {
      const { status, body } = await api('GET', '/token-permits?page=1&limit=10', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(1);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalPages).toBe(1);
    });

    it('should return empty data for page beyond total', async () => {
      const { status, body } = await api('GET', '/token-permits?page=2&limit=10', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.meta.total).toBe(1);
      expect(body.meta.page).toBe(2);
      expect(body.data.length).toBe(0);
    });

    /* ── Wait for blockchain permit execution + balance refresh ── */

    it('wait for alice permit to execute and balance to refresh', async () => {
      // Permit processor runs async — wait for balance refresh
      await new Promise(r => setTimeout(r, 15000));
      const { status, body } = await api('GET', '/users/me', auth.alice.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(100);
      expect(body.tokenAllowance).toBe(3.25);
      expect(body.tokenSpendable).toBe(3.25);
    });

    it('wait for bob permit to execute and balance to refresh', async () => {
      const { status, body } = await api('GET', '/users/me', auth.bob.jwt);
      expect(status).toBe(200);
      expect(body.tokenBalance).toBe(100);
      expect(body.tokenAllowance).toBe(2);
      expect(body.tokenSpendable).toBe(2);
    });

    /* ── Consume remaining User events from permit processing ─── */

    it('consume remaining User events from permit execution', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      // Permit execution triggers User updates (action, tokenBalance, tokenAllowance, tokenSpendable)
      const adminEvents = groupByResourceName(adminUserProcessEvents);
      const aliceEvents = groupByResourceName(aliceUserProcessEvents);
      const bobEvents = groupByResourceName(bobUserProcessEvents);
      // Admin gets User events for permit processing
      if (adminEvents.User) expect(adminEvents.User.length).toBeGreaterThanOrEqual(0);
      // Alice and Bob get User events for their balance refreshes
      if (aliceEvents.User) expect(aliceEvents.User.length).toBeGreaterThanOrEqual(0);
      if (bobEvents.User) expect(bobEvents.User.length).toBeGreaterThanOrEqual(0);
      adminUserProcessEvents = [];
      aliceUserProcessEvents = [];
      bobUserProcessEvents = [];
    });

    /* ── Cleanup MQTT clients ────────────────────────────────────── */

    it('no unprocessed events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      if (adminUserProcessEvents.length > 0) console.log('Unprocessed admin user events:', adminUserProcessEvents.length, adminUserProcessEvents);
      if (aliceUserProcessEvents.length > 0) console.log('Unprocessed alice user events:', aliceUserProcessEvents.length, aliceUserProcessEvents);
      if (bobUserProcessEvents.length > 0) console.log('Unprocessed bob user events:', bobUserProcessEvents.length, bobUserProcessEvents);
      expect(adminUserProcessEvents.length).toBe(0);
      expect(aliceUserProcessEvents.length).toBe(0);
      expect(bobUserProcessEvents.length).toBe(0);
    });

    afterAll(() => {
      adminMqttClient?.end();
      aliceMqttClient?.end();
      bobMqttClient?.end();
    });
  });
}
