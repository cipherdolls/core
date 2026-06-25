# CipherDolls Server

A minimal chat backend, derived from `cipherdolls/core` and stripped to the essentials:
**start a chat with a Character and exchange messages**, with optional text-to-speech and
audio-message speech-to-text. No payments. One provider per role.

Built with **Bun**, **Elysia**, **Prisma**, **PostgreSQL**, **BullMQ + Redis**, and an
embedded **MQTT** broker for realtime events — the same architecture as core.

## What's different from core

- **Character = Avatar + Scenario merged.** One `Character` row carries personality, voice
  (`ttsVoice`), and the scenario/system prompt + LLM settings (`chatModel`). A `Chat` links to a
  single `Character`.
- **No payment.** No transactions, token service, permits, sponsorships, balances, or per-use cost
  tracking.
- **One provider per role:** Kokoro (TTS), Groq Whisper (STT), and any OpenAI-compatible chat model.
- **Dropped:** IoT dolls, embeddings/reasoning models, filler words, API keys, and pgvector.
- `chatCompletionJobs` is renamed `chatCompletion`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Framework | Elysia |
| Database | PostgreSQL + Prisma |
| Job Queue | BullMQ + Redis |
| Realtime | Aedes MQTT broker (TCP + WebSocket) |
| Auth | Ethereum wallet signature + JWT |

## Getting Started

```bash
bun install
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET_KEY, provider keys
bun run db:generate
bun run db:push
bun run db:seed             # one provider/model/voice + one Character

bun run dev                 # API on http://localhost:4000 (Swagger at /api)
bun run worker              # BullMQ worker (separate process, requires Redis)
```

## Architecture

### Auth
Ethereum wallet signature flow: `GET /auth/nonce` → sign → `POST /auth/signin` → JWT.

### Chat flow
1. `POST /chats { characterId }` creates a chat (greeting message auto-created from the character).
2. `POST /messages { chatId, content }` — a text message triggers a `chatCompletion` job; the LLM
   reply is persisted as an ASSISTANT message and (if `chat.tts`) a `ttsJob` streams Kokoro audio
   over Redis pub/sub.
3. Audio-only user messages run a `sttJob` (Groq Whisper) first, then chat completion.

Background workers (the `worker` process) consume BullMQ queues and publish MQTT process events
scoped per user/chat (e.g. `users/{id}/processEvents`).

## API surface
`/auth`, `/users`, `/characters`, `/chats`, `/messages`, `/chat-completions`,
`/ai-providers`, `/chat-models`, `/stt-providers`, `/tts-providers`, `/tts-voices`, `/pictures`.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET_KEY` | Yes | — | JWT signing secret |
| `OPENAI_API_KEY` | Yes* | — | Key for the OpenAI-compatible chat endpoint |
| `OPENAI_BASE_PATH` | No | `https://api.openai.com/v1` | Chat completions base path |
| `CHAT_MODEL` | No | `gpt-4o-mini` | Seeded chat model name |
| `GROQ_API_KEY` | Yes* | — | Groq Whisper (STT) key |
| `CIPHERDOLLS_KOKORO_URL` | No | `http://localhost:8880` | Kokoro TTS endpoint |
| `PORT` | No | `4000` | API port |
| `ASSETS_PATH` | No | `/app/uploads` | File storage path |
| `MQTT_BROKER_URL` | No | `mqtt://localhost:1883` | MQTT broker URL |

\* Required only for the corresponding feature (LLM replies / STT).
