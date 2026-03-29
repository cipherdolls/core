
import { ethers } from 'ethers';
import mqtt from 'mqtt';
import { BASE_URL, MQTT_URL, wallets, auth, signIn, createApiKey, api, get } from './helpers';

/* ────────────────────────────────────────────────────────────────
   State shared across sequential tests
   ──────────────────────────────────────────────────────────────── */

let adminJwt: string;
let adminUserId: string;
let adminApiKey: string;
let adminApiKeyId: string;

let guestJwt: string;
let guestUserId: string;
let guestApiKey: string;

let aliceJwt: string;
let aliceUserId: string;
let aliceApiKey: string;
let aliceApiKeyId: string;

let bobJwt: string;
let bobUserId: string;
let bobApiKey: string;
let bobApiKeyId: string;

export function describeAuth() {
  describe('auth Controller (e2e)', () => {

    /* ── Sign In ──────────────────────────────────────────────── */

    it('signin Admin', async () => {
      adminJwt = await signIn(wallets.admin.pk, wallets.admin.address);
      expect(adminJwt).toBeDefined();
      // Populate shared auth record
      auth.admin.jwt = adminJwt;
    });

    it('get me as Admin', async () => {
      const { status, body } = await api('GET', '/users/me', adminJwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name');
      expect(body).toHaveProperty('role', 'ADMIN');
      expect(body).toHaveProperty('signerAddress', ethers.getAddress(wallets.admin.address));
      expect(body).toHaveProperty('lastSignInAt');
      expect(new Date(body.lastSignInAt).getTime()).not.toBeNaN();
      adminUserId = body.id;
      auth.admin.userId = adminUserId;
      auth.admin.signerAddress = body.signerAddress;
    });

    it('create apikey for Admin', async () => {
      const res = await fetch(`${BASE_URL}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
        body: JSON.stringify({ name: 'Admin Key' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body).toHaveProperty('key');
      expect(body).toHaveProperty('name', 'Admin Key');
      expect(body).toHaveProperty('userId', adminUserId);
      adminApiKey = body.key;
      adminApiKeyId = body.id;
      auth.admin.apiKey = adminApiKey;
    });

    /* ── Guest ─────────────────────────────────────────────────── */

    it('signin Guest', async () => {
      guestJwt = await signIn(wallets.guest.pk, wallets.guest.address, {
        name: 'Jon',
        gender: 'Male',
        language: 'en',
      });
      expect(guestJwt).toBeDefined();
      auth.guest.jwt = guestJwt;
    });

    it('get me as Guest', async () => {
      const { status, body } = await api('GET', '/users/me', guestJwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Jon');
      expect(body).toHaveProperty('gender', 'Male');
      expect(body).toHaveProperty('language', 'en');
      expect(body).toHaveProperty('role', 'USER');
      expect(body).toHaveProperty('signerAddress', ethers.getAddress(wallets.guest.address));
      guestUserId = body.id;
      auth.guest.userId = guestUserId;
      auth.guest.signerAddress = body.signerAddress;
    });

    it('create apikey for Guest', async () => {
      const res = await fetch(`${BASE_URL}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestJwt}` },
        body: JSON.stringify({ name: 'Guest Key' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body).toHaveProperty('key');
      expect(body).toHaveProperty('name', 'Guest Key');
      expect(body).toHaveProperty('userId', guestUserId);
      guestApiKey = body.key;
      auth.guest.apiKey = guestApiKey;
    });

    /* ── Alice ─────────────────────────────────────────────────── */

    it('signin Alice', async () => {
      aliceJwt = await signIn(wallets.alice.pk, wallets.alice.address);
      expect(aliceJwt).toBeDefined();
      auth.alice.jwt = aliceJwt;
    });

    it('get me as Alice', async () => {
      const { status, body } = await api('GET', '/users/me', aliceJwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('role', 'USER');
      expect(body).toHaveProperty('language', 'en');
      expect(body).toHaveProperty('signerAddress', ethers.getAddress(wallets.alice.address));
      aliceUserId = body.id;
      auth.alice.userId = aliceUserId;
      auth.alice.signerAddress = body.signerAddress;
    });

    it('create apikey for Alice', async () => {
      const res = await fetch(`${BASE_URL}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceJwt}` },
        body: JSON.stringify({ name: 'Alice Key' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body).toHaveProperty('key');
      expect(body).toHaveProperty('name', 'Alice Key');
      expect(body).toHaveProperty('userId', aliceUserId);
      aliceApiKey = body.key;
      aliceApiKeyId = body.id;
      auth.alice.apiKey = aliceApiKey;
    });

    it('get me as Alice via apikey', async () => {
      const { status, body } = await get('/users/me', aliceApiKey);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', aliceUserId);
      expect(body).toHaveProperty('role', 'USER');
      expect(body).toHaveProperty('signerAddress', ethers.getAddress(wallets.alice.address));
    });

    /* ── MQTT Auth ─────────────────────────────────────────────── */

    it('can subscribe to alice processEvents as alice', (done) => {
      const mqttClient = mqtt.connect(MQTT_URL, {
        username: '',
        password: aliceJwt,
      });

      mqttClient.on('connect', () => {
        mqttClient.subscribe(`users/${aliceUserId}/processEvents`, (err) => {
          if (err) {
            done(err);
          } else {
            expect(mqttClient.connected).toBe(true);
            mqttClient.end();
            done();
          }
        });
      });

      mqttClient.on('error', (err) => {
        done(err);
      });
    });

    it('fails to connect with wrong jwt', (done) => {
      const mqttClient = mqtt.connect(MQTT_URL, {
        username: '',
        password: 'wrong-key',
      });

      mqttClient.on('connect', () => {
        mqttClient.end();
        done(new Error('Should not have connected'));
      });

      mqttClient.on('error', (err) => {
        expect(err.message).toContain('Connection refused');
        mqttClient.end();
        done();
      });
    });

    it('fails to subscribe to an unauthorized topic with a valid connection', (done) => {
      const mqttClient = mqtt.connect(MQTT_URL, {
        username: '',
        password: aliceJwt,
      });

      mqttClient.on('connect', () => {
        const unauthorizedTopic = `users/${bobUserId}/processEvents`;
        mqttClient.subscribe(unauthorizedTopic, (err) => {
          expect(err).toBeTruthy();
          mqttClient.end();
          done();
        });
      });

      mqttClient.on('error', (err) => {
        done(err);
      });
    });

    /* ── Update Alice ──────────────────────────────────────────── */

    it('update Alice name and Gender and Language', async () => {
      const { status, body } = await api('PATCH', `/users/${aliceUserId}`, aliceJwt, {
        name: 'Super Alice',
        gender: 'Female',
        language: 'de',
        signerAddress: ethers.getAddress(wallets.alice.address),
      });
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Super Alice');
      expect(body).toHaveProperty('role', 'USER');
      expect(body).toHaveProperty('signerAddress', ethers.getAddress(wallets.alice.address));
      expect(body).toHaveProperty('gender', 'Female');
      expect(body).toHaveProperty('language', 'de');
    });

    /* ── Invitation Flow ───────────────────────────────────────── */

    it('failed to signin with wrong invitation', async () => {
      const nonceRes = await fetch(`${BASE_URL}/auth/nonce`);
      const { nonce } = (await nonceRes.json()) as any;
      const message = `I am signing this message to prove my identity. Nonce: ${nonce}`;
      const wallet = new ethers.Wallet(wallets.bob.pk);
      const signedMessage = await wallet.signMessage(message);

      const res = await fetch(`${BASE_URL}/auth/signin?invitedBy=00000000-0000-0000-0000-000000000000`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedMessage, message, address: wallet.address }),
      });
      expect(res.status).toBe(400);
    });

    it('signin Bob with invitation from Alice', async () => {
      bobJwt = await signIn(wallets.bob.pk, wallets.bob.address, { invitedBy: aliceUserId });
      expect(bobJwt).toBeDefined();
      auth.bob.jwt = bobJwt;
    });

    it('does not change inviter on subsequent signins', async () => {
      // Bob tries to switch inviter to Admin — should stay Alice
      const newToken = await signIn(wallets.bob.pk, wallets.bob.address, { invitedBy: adminUserId });
      const { body } = await api('GET', '/users/me', newToken);
      expect(body.invitedById).toBe(aliceUserId);
    });

    /* ── Bob ───────────────────────────────────────────────────── */

    it('get me as Bob', async () => {
      const { status, body } = await api('GET', '/users/me', bobJwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Adam');
      expect(body).toHaveProperty('role', 'USER');
      expect(body).toHaveProperty('signerAddress', ethers.getAddress(wallets.bob.address));
      expect(body).toHaveProperty('invitedById', aliceUserId);
      bobUserId = body.id;
      auth.bob.userId = bobUserId;
      auth.bob.signerAddress = body.signerAddress;
    });

    it('create apikey for Bob', async () => {
      const res = await fetch(`${BASE_URL}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bobJwt}` },
        body: JSON.stringify({ name: 'Bob Key' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body).toHaveProperty('key');
      expect(body).toHaveProperty('name', 'Bob Key');
      expect(body).toHaveProperty('userId', bobUserId);
      bobApiKey = body.key;
      bobApiKeyId = body.id;
      auth.bob.apiKey = bobApiKey;
    });

    it('get me as Bob via apikey', async () => {
      const { status, body } = await get('/users/me', bobApiKey);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', bobUserId);
      expect(body).toHaveProperty('name', 'Adam');
      expect(body).toHaveProperty('role', 'USER');
      expect(body).toHaveProperty('signerAddress', ethers.getAddress(wallets.bob.address));
    });

    it('get me as Admin via apikey', async () => {
      const { status, body } = await get('/users/me', adminApiKey);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id', adminUserId);
      expect(body).toHaveProperty('role', 'ADMIN');
    });

    it('get me with invalid apikey → 401', async () => {
      const { status } = await get('/users/me', 'invalid-api-key-12345');
      expect(status).toBe(401);
    });

    it('get me without auth → 401', async () => {
      const res = await fetch(`${BASE_URL}/users/me`);
      expect(res.status).toBe(401);
    });

    /* ── API Key Isolation ─────────────────────────────────────── */

    it('alice only sees her own api keys', async () => {
      const { status, body } = await api('GET', '/api-keys', aliceJwt);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0]).toHaveProperty('userId', aliceUserId);
      expect(body.data[0]).toHaveProperty('name', 'Alice Key');
    });

    it('bob cannot delete alice api key → 403', async () => {
      const { status } = await api('DELETE', `/api-keys/${aliceApiKeyId}`, bobJwt);
      expect(status).toBe(403);
    });

    it('alice cannot delete bob api key → 403', async () => {
      const { status } = await api('DELETE', `/api-keys/${bobApiKeyId}`, aliceJwt);
      expect(status).toBe(403);
    });

    it('bob cannot delete non-existent api key → 404', async () => {
      const { status } = await api('DELETE', '/api-keys/00000000-0000-0000-0000-000000000000', bobJwt);
      expect(status).toBe(404);
    });

    it('alice can delete her own api key', async () => {
      // Create a second key to delete (keep the original for other tests)
      const createRes = await fetch(`${BASE_URL}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceJwt}` },
        body: JSON.stringify({ name: 'Temp Key' }),
      });
      expect(createRes.status).toBe(200);
      const created = (await createRes.json()) as any;

      const { status: deleteStatus } = await api('DELETE', `/api-keys/${created.id}`, aliceJwt);
      expect(deleteStatus).toBe(200);

      // Verify it's gone
      const { body: listBody } = await api('GET', '/api-keys', aliceJwt);
      expect(listBody.data.length).toBe(1);
      expect(listBody.data[0].id).toBe(aliceApiKeyId);
    });

    it('guest cannot access api keys without auth → 401', async () => {
      const res = await fetch(`${BASE_URL}/api-keys`);
      expect(res.status).toBe(401);
    });

    /* ── User Data ─────────────────────────────────────────────── */

    it('get user alice', async () => {
      const { status, body } = await api('GET', '/users/me', aliceJwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Super Alice');
      expect(body).toHaveProperty('role', 'USER');
      expect(body).toHaveProperty('signerAddress', ethers.getAddress(wallets.alice.address));
      expect(body).toHaveProperty('invitedById', null);
      expect(body).toHaveProperty('referralCount', 1);
    });

    it('get user bob', async () => {
      const { status, body } = await api('GET', '/users/me', bobJwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name', 'Adam');
      expect(body).toHaveProperty('role', 'USER');
      expect(body).toHaveProperty('signerAddress', ethers.getAddress(wallets.bob.address));
      expect(body).toHaveProperty('invitedById', aliceUserId);
      expect(body).toHaveProperty('referralCount', 0);
    });

    /* ── Verify ────────────────────────────────────────────────── */

    it('POST /auth/verify returns valid', async () => {
      const res = await fetch(`${BASE_URL}/auth/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${aliceJwt}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.token).toBe('valid');
    });
  });
}
