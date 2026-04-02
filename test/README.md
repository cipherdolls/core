# E2E Test Guide

## Architecture

Tests follow a **modular describe-function pattern**:

- **Spec files** (`.e2e-spec.ts`) — entry points that compose test modules
- **Test modules** (`.ts`) — export `describe*()` functions with test logic
- **`helpers.ts`** — shared utilities (API client, MQTT, auth, waiters)
- **`setup.ts`** — global beforeAll/afterAll (DB reset, Redis flush, Anvil snapshot)

```
avatars.e2e-spec.ts
  → setBeforeAll()         # Reset DB, Redis, Anvil
  → describeAuth()         # Sign in users
  → describeTokenPermits() # Fund wallets
  → describeTtsProviders() # Create providers
  → describeTtsVoices()    # Create voices
  → describeScenarios()    # Create scenarios
  → describeAvatars()      # Actual avatar tests
  → setAfterAll()          # Revert Anvil snapshot
```

Tests are **sequential** — each module builds on state from the previous one.

## Running Tests

```bash
cd devops/local

# Single spec
make test-avatars
make test SPEC=auth

# Custom timeout (default 600s)
make test SPEC=dolls TIMEOUT=300

# GPU services (for TTS/STT)
make gpu-up
make gpu-down
```

**Never run `make test-all`.** Always run each spec individually after making changes. This keeps feedback loops fast and makes failures easy to diagnose.

Logs are saved to `/tmp/e2e-test-logs/<spec>.log`.

## Helpers

| Helper | Description |
|--------|-------------|
| `api(method, path, jwt, body?)` | HTTP request, returns `{ status, body }` |
| `get(path, jwt?)` | GET shorthand |
| `signIn(pk, address, opts?)` | Sign in with wallet, returns JWT |
| `createApiKey(jwt, name)` | Create API key |
| `connectMqtt(password)` | Connect MQTT client (password = JWT or apiKey) |
| `subscribeTopic(client, topic)` | Subscribe and collect events |
| `waitForQueuesEmpty(timeout?)` | Wait for all BullMQ jobs to drain + MQTT propagation |
| `groupByResourceName(events)` | Group ProcessEvents by resource (e.g. `Avatar`, `TtsVoice`) |
| `auth` | Shared record with JWT/apiKey/userId for admin, alice, bob, guest |
| `wallets` | Deterministic test wallets with address + private key |

## Writing Tests

### Rules

1. **One concern per `it()` block** — separate POST, `waitForQueuesEmpty`, and GET into individual `it()` blocks
2. **Always assert events before clearing** — never just `waitForQueuesEmpty(); events = []`. Always verify event content first:
   ```typescript
   await waitForQueuesEmpty(60000);
   const events = groupByResourceName(processEvents);
   expect(events.Avatar?.length).toBeGreaterThanOrEqual(2);
   processEvents = [];
   ```
3. **Always assert POST response** — after a POST, expect all returned fields match what was sent
4. **Always capture ProcessEvents after CUD** — every create, update, or delete needs a follow-up `it()` that drains and asserts events
5. **Never share variables between tests** — don't pass data via `let` from one `it()` to another. Fetch resources via GET at the start of each test. Exception: IDs needed for cross-module dependencies (`export let hanaAvatarId`)
6. **Multi-user testing** — always test with multiple users (alice, bob) covering CRUD and accessibility. Verify bob can't see/edit alice's private resources
7. **Clean up** any resources you create (delete avatars, close MQTT clients)
8. **Fix failures in dependency order** — if auth tests fail causing avatar failures, fix auth first. Always fix the first failing test in the spec chain
9. **Export IDs** that downstream modules need

### Test Module Template

```typescript
// test/myFeature.ts
import { auth, api, connectMqtt, waitForQueuesEmpty, groupByResourceName,
         type ProcessEvent, type MqttClient } from './helpers';

export let myFeatureId: string;

export function describeMyFeature() {
  describe('MyFeature', () => {
    let mqttClient: MqttClient;
    let processEvents: ProcessEvent[] = [];

    // ─── MQTT setup ─────────────────────────────────────
    it('connect MQTT client', async () => {
      mqttClient = await connectMqtt(auth.alice.jwt);
      mqttClient.subscribe(`users/${auth.alice.userId}/processEvents`);
      mqttClient.on('message', (_topic, msg) => {
        processEvents.push(JSON.parse(msg.toString()));
      });
    });

    // ─── Create ─────────────────────────────────────────
    it('alice creates myFeature', async () => {
      const { status, body } = await api('POST', '/my-feature', auth.alice.jwt, {
        name: 'Test',
      });
      expect(status).toBe(200);
      myFeatureId = body.id;
    });

    it('processEvents after create contain MyFeature events', async () => {
      await waitForQueuesEmpty(60000);
      const events = groupByResourceName(processEvents);
      expect(events.MyFeature?.length).toBeGreaterThanOrEqual(2); // active + completed
      processEvents = [];
    });

    it('alice gets myFeature by id', async () => {
      const { status, body } = await api('GET', `/my-feature/${myFeatureId}`, auth.alice.jwt);
      expect(status).toBe(200);
      expect(body).toHaveProperty('name', 'Test');
    });

    // ─── Cleanup MQTT ───────────────────────────────────
    it('consume remaining events', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      processEvents = [];
    });

    it('no unprocessed events remaining', async () => {
      await waitForQueuesEmpty();
      await new Promise((r) => setTimeout(r, 500));
      expect(processEvents.length).toBe(0);
    });

    it('close MQTT client', () => {
      mqttClient?.end();
    });
  });
}
```

### Spec File Template

```typescript
// test/myFeature.e2e-spec.ts
import { describeAuth } from './auth';
import { describeMyFeature } from './myFeature';
import { setBeforeAll, setAfterAll } from './setup';

describe('myFeature Controller (e2e)', () => {
  setBeforeAll();
  describeAuth();       // Always needed for JWT/auth
  describeMyFeature();
  setAfterAll();
});
```

If your module depends on other modules (e.g. TTS voices, scenarios), import and call their describe functions before yours in the spec file.

### Register the Spec

Add your spec name to `devops/local/Makefile`:

```makefile
SPECS := aiProviders auth ... myFeature
```

Then run with `make test-myFeature`.

## Test Users

| User | Role | Purpose |
|------|------|---------|
| `admin` | ADMIN | Create providers, voices, manage resources |
| `alice` | USER | Primary test user |
| `bob` | USER | Secondary user for visibility/permission tests |
| `guest` | USER | Zero-balance user for permission tests |

## ProcessEvent Pattern

Every CUD operation enqueues a BullMQ job that publishes MQTT events:

```
POST /resource → queue job → worker processes → MQTT: active → MQTT: completed
```

Always follow this pattern:

```typescript
it('create resource', async () => { /* POST */ });
it('drain events', async () => { await waitForQueuesEmpty(60000); events = []; });
it('verify resource', async () => { /* GET + expect */ });
```
