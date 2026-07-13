# CipherDolls Core

Backend API for the CipherDolls AI companion platform. Built with **Bun**, **Elysia**, **Prisma**, and **PostgreSQL** (pgvector). Handles user auth, AI chat completions, text-to-speech, speech-to-text, embeddings, USDC payments on Base, and IoT device management via MQTT.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Framework | Elysia |
| Database | PostgreSQL 16 + pgvector |
| ORM | Prisma |
| Job Queue | BullMQ + Redis |
| Realtime | Aedes MQTT broker (TCP + WebSocket) |
| Blockchain | Ethers.js, USDC (ERC-20) on Base |
| Auth | Ethereum wallet signature + JWT |

## Getting Started

```bash
# Install dependencies
bun install

# Generate Prisma client
bun run db:generate

# Push schema to database
bun run db:push

# Start dev server (with watch)
bun run dev

# Start production server
bun run start
```

The API runs on `http://localhost:4000` with Swagger docs at `/api`.

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start with file watching |
| `bun run start` | Production start |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:push` | Push schema to database |
| `bun run db:migrate` | Run Prisma migrations |
| `bun run test:e2e` | Run all E2E tests |

## Project Structure

```
core/
├── src/
│   ├── index.ts                # Entry point, route registration, startup
│   ├── db.ts                   # Prisma client
│   ├── helpers/                # Pagination, validation, admin checks
│   ├── auth/                   # Wallet signature auth, JWT guards
│   ├── users/                  # User profiles and management
│   ├── apiKeys/                # API key management
│   ├── aiProviders/            # LLM provider configuration
│   ├── chatModels/             # Chat completion model config
│   ├── embeddingModels/        # Embedding model config
│   ├── reasoningModels/        # Reasoning model config
│   ├── sttProviders/           # Speech-to-text providers
│   ├── ttsProviders/           # Text-to-speech providers
│   ├── ttsVoices/              # TTS voice selection
│   ├── scenarios/              # Chat templates with system prompts
│   ├── avatars/                # AI personality configurations
│   ├── families/               # Avatar bundles for dedicated webapps
│   ├── chats/                  # Conversations
│   ├── messages/               # Chat messages
│   ├── chatCompletionJobs/     # LLM request processing
│   ├── embeddingJobs/          # Vector embedding jobs
│   ├── ttsJobs/                # TTS generation jobs
│   ├── dolls/                  # IoT hardware devices
│   ├── dollBodies/             # Hardware models
│   ├── firmwares/              # Device firmware versions
│   ├── transactions/           # Blockchain USDC transactions
│   ├── tokenPermits/           # EIP-2612 permit signatures
│   ├── sponsorships/           # User scenario sponsorships
│   ├── token/                  # USDC token service + contract ABI
│   ├── queue/                  # BullMQ connection, processors, registry
│   ├── mqtt/                   # MQTT broker and client
│   ├── llm/                    # LLM chat completion integration
│   └── tts/                    # TTS helpers
├── prisma/
│   └── schema.prisma           # Database schema (27 models)
├── test/
│   ├── docker-compose.yaml     # Test environment (postgres, redis, foundry)
│   ├── Makefile                # Test orchestration
│   ├── setup.ts                # DB reset, Redis flush, wallet funding
│   ├── helpers.ts              # Shared test utilities
│   └── *.e2e-spec.ts           # E2E test specs
├── Dockerfile
├── bunfig.toml
├── tsconfig.json
└── package.json
```

Each domain module contains a `routes.ts` for API endpoints and an optional `processor.ts` for async BullMQ job handling.

## Architecture

### Authentication

Ethereum wallet signature flow: request a nonce via `GET /auth/nonce`, sign it with your wallet, then `POST /auth/signin` to receive a JWT. API keys are also supported as Bearer tokens.

### Job Processing

Background workers (enabled with `WORKER=true`) process async jobs via BullMQ queues:

1. User sends a message
2. Text routes to ChatCompletionJob + EmbeddingJob; audio routes to SttJob first
3. LLM completion creates an assistant message (triggers TTS + embedding)
4. Each job tracks USD cost and creates a blockchain Transaction record

### MQTT

An embedded Aedes MQTT broker provides real-time events to frontends and IoT devices. Topics are scoped per user/doll/chat (e.g. `users/{id}/processEvents`). Authenticated via JWT, API key, or system key.

### Blockchain

USDC (ERC-20) on Base chain. Wallet signature verification for auth, token permits (EIP-2612) for gas-less approvals, and automated fee transactions for AI service usage.

## E2E Tests

Tests run against real services in Docker (PostgreSQL, Redis, Anvil blockchain fork).

```bash
cd test/

# Run a single spec
make test SPEC=avatars

# Run all specs sequentially
make test-all

# Full cleanup
make clean
```

Available specs: `aiProviders auth avatars chatModels chats dollBodies dolls embeddingModels messages transactions reasoningModels scenarios sponsorships sttProviders tokenPermits ttsProviders ttsVoices firmwares`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET_KEY` | Yes | — | JWT signing secret |
| `RPC_URL` | Yes | — | Ethereum RPC endpoint |
| `PORT` | No | `4000` | API port |
| `WORKER` | No | `false` | Enable BullMQ workers |
| `MQTT_BROKER_URL` | No | `mqtt://localhost:1883` | MQTT broker URL |
| `MQTT_BROKER_TCP` | No | — | Enable TCP listener |
| `MQTT_BROKER_WS` | No | — | Enable WebSocket listener |
| `MQTT_BROKER_KEY` | No | — | System key for broker auth |
| `GPU_HOST` | No | — | GPU services host (Kokoro, Whisper, Ollama) |
| `TOKEN_ADDRESS` | No | Base mainnet USDC | USDC contract address |

## Docker

```bash
docker build -t cipherdolls-core .
docker run -p 4000:4000 --env-file .env cipherdolls-core
```

Health check endpoint: `GET /auth/nonce`
