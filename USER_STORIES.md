# CipherDolls Core — User Stories

Derived from E2E test specs. Each story represents verified behavior tested against real services (PostgreSQL, Redis, Anvil blockchain, Ollama LLM, Kokoro TTS, Whisper STT).

**Total: 5,416 tests across 22 specs**

---

## Authentication & Users

### Wallet-based Authentication
- A user can sign in with an Ethereum wallet signature and receive a JWT
- A returning user gets a new JWT without creating a duplicate account
- A user can create and use API keys for programmatic access
- A user can view their profile (name, gender, language, token balances)
- A user can update their name, gender, and language
- A user can invite another user via referral link
- An invited user's inviter is recorded and does not change on subsequent sign-ins
- Invalid wallet signatures are rejected (401)
- Expired or invalid JWTs are rejected (401)
- Invalid API keys are rejected (401)
- Users can only see and delete their own API keys

### MQTT Real-time Events
- Authenticated users can subscribe to their own process event topics
- Users cannot connect with an invalid JWT
- Users cannot subscribe to another user's topics

---

## Token Permits & Balances

### ERC-20 Token Management
- Admin, Alice, and Bob start with 0 token balance
- Token balances can be refreshed from the blockchain (RefreshTokenBalanceAndAllowance)
- After refresh, users see their on-chain USDC balance (100) and allowance
- Users can create EIP-2612 permit signatures for gasless token approvals
- Permit processing is async — balance is available before permit executes
- After permit execution, tokenSpendable reflects the approved allowance
- Each user only sees their own permits (cross-user isolation)
- Pagination works correctly for permit listings
- Guest (no permit) has 0 tokenSpendable throughout
- All permit MQTT events (active/completed) are tracked

---

## AI Providers

### Provider CRUD
- Admin can create AI providers (Ollama Chat, Ollama Reasoning, Ollama Embedding, OpenRouter)
- Non-admin users cannot create AI providers (403)
- All users (including anonymous) can list and view AI providers
- API keys are stripped from responses (never exposed)
- Admin can update provider name, API key, and base path
- Non-admin users cannot update providers (403)
- Providers can be filtered by name (case-insensitive)

---

## Chat Models

### Model Configuration
- Admin can create chat models linked to an AI provider
- Models have pricing (dollarPerInputToken, dollarPerOutputToken), context window, and censorship flags
- Models auto-compute `free` flag when both costs are zero
- Updating costs recalculates the free flag
- Admin can update providerModelName, pricing, and flags
- Non-admin users cannot create or update models (403)
- All MQTT events for model operations are tracked

---

## Embedding Models

### Vector Embedding Configuration
- Admin can create embedding models linked to an AI provider
- Models have per-token pricing and recommended flag
- Admin can update model name, pricing, and flags
- Non-admin users cannot create or modify embedding models

---

## Reasoning Models

### Reasoning Model Configuration
- Admin can create reasoning models with context window and censorship settings
- Admin can update providerModelName, pricing, context window, and flags
- Non-admin users cannot manage reasoning models

---

## STT Providers

### Speech-to-Text Configuration
- Admin can create STT providers (Local Whisper, Groq Whisper)
- Providers have per-second pricing and recommended flag
- Free flag auto-computes based on dollarPerSecond
- All users can list and view STT providers
- Non-admin users cannot create, update, or delete providers

---

## TTS Providers

### Text-to-Speech Configuration
- Admin can create TTS providers (CipherdollsKokoro, ElevenLabs)
- Providers have per-character pricing and censorship flag
- Admin can update pricing and censorship settings
- Admin can delete providers
- All users (including anonymous) can list and view providers
- Non-admin users cannot modify providers
- All MQTT events (create/update/delete) produce active+completed pairs

---

## TTS Voices

### Voice Management
- Admin can add voices to a TTS provider (Heart, Bella, Nicole, Adam)
- Voices have gender, language, providerVoiceId, and recommended flag
- Admin can update voice attributes (providerVoiceId, gender, recommended)
- Preview audio is generated for voices
- All users can list, filter, and view voices
- Non-admin users cannot modify voices
- Voices are deleted when their parent provider is deleted (cascade)

---

## Scenarios

### Conversation Templates
- Users with spendable tokens can create scenarios with system prompts
- Scenarios link to a chat model, optional embedding model, and optional reasoning model
- Scenarios have pricing (dollarPerMessage), temperature, and penalty settings
- Free flag auto-computes based on dollarPerMessage
- Users can publish scenarios (with validation rules)
- Admin can set recommended flag on scenarios
- Users see their own + published scenarios; anonymous sees only published
- Scenarios support NORMAL and ROLEPLAY types
- Scenarios can have gender preferences (userGender, avatarGender)
- NSFW flag controls content filtering
- Published scenarios cannot be deleted by non-admin owners
- Guest (0 tokens) cannot create scenarios (403)

---

## Avatars

### AI Personality Configuration
- Users with spendable tokens can create avatars with name, character, and TTS voice
- Avatars auto-compute `free` flag based on their TTS provider's cost
- Avatars can be published (only if all assigned scenarios are published)
- Admin can set recommended flag
- Avatars link to multiple scenarios (many-to-many)
- Users see their own + chatted-with avatars; anonymous sees only published
- Private avatars are only visible to their owner
- Guest (0 tokens) cannot create avatars (403)
- All MQTT events for avatar operations are tracked

---

## Chats

### Conversation Sessions
- Users can create chats by selecting an avatar and scenario
- **Free scenario + free avatar**: guest (0 tokens) CAN create a chat
- **Paid scenario (dollarPerMessage > 0)**: guest CANNOT create a chat (403)
- **Free scenario + paid avatar (non-free TTS)**: guest CANNOT create a chat (403)
- **Sponsored paid scenario**: guest CAN create a chat (sponsorship bypasses token check)
- **Sponsorship removed**: guest is blocked again
- Users with tokens can always create chats regardless of pricing
- Chats include nested scenario (with models), avatar, STT provider, and doll
- Users can switch scenarios on an existing chat
- Users can enable/disable TTS on a chat
- Users can only access their own chats (404 for others)
- System prompts are generated from avatar + scenario + user context
- Bob cannot see Alice's chats or system prompts
- All MQTT events for chat operations are tracked

---

## Messages

### Text Messages
- Users can post text messages to their chats
- Messages trigger the LLM pipeline: chatCompletion → assistant response
- LLM responds correctly to geography questions ("Berlin" for Germany, "Paris" for France)
- Message count increases by 2 after posting (USER + ASSISTANT)
- Messages support cursor-based pagination (prev/next cursors, hasMore)
- Users can delete their own messages
- Deleted messages return 404
- Anonymous users cannot post messages (401)
- Bob cannot post to Alice's chat (403)

### Audio Messages
- Users can upload audio files via multipart form-data
- Uploaded audio gets a random filename (.mp3)
- Audio files are downloadable via GET /messages/:id/audio
- Audio endpoint returns 404 for text-only messages
- Audio endpoint returns 404 for non-existent messages
- Audio + text combined: both content and fileName are stored
- Deleted audio messages return 404 on the audio endpoint

### Voice Pipeline (Kokoro TTS → Whisper STT → LLM → TTS)
- Audio is generated via Kokoro TTS asking "What is the capital of Italy?"
- Audio is uploaded as a message (content is null, fileName set)
- Audio file is downloadable and valid MP3
- **STT transcribes the audio** and populates message content with "italy"/"capital"
- **LLM creates an ASSISTANT response** after STT transcription
- **ASSISTANT response contains "Rome"**
- **ASSISTANT message gets TTS audio** file generated
- **ASSISTANT audio is downloadable** and valid MP3
- **Whisper transcription of ASSISTANT audio contains "Rome"**
- All MQTT events fire: Message, SttJob, ChatCompletionJob, TtsJob (active+completed pairs)

---

## Dolls (IoT Devices)

### Device Management
- Users can register dolls by MAC address, linked to a doll body
- Re-registering the same MAC address returns the existing doll (or reassigns to new user)
- Dolls auto-assign a chat if none provided (finds existing or creates new)
- Users can update doll name and chat assignment
- Dolls can disconnect from chats (nullable chatId)
- Users can only access their own dolls
- MQTT events are published to doll-specific topics

### Doll Bodies
- Admin can create doll body models with name, description, and avatar link
- Doll bodies can be published and have product URLs
- All users can list and view doll bodies

---

## Firmwares

### Device Firmware Management
- Admin can create firmware versions for doll bodies
- Firmwares have version, binary files (bootloader, firmware, partition), and checksums
- Users can list and download firmware files

---

## Sponsorships

### Scenario Sponsoring
- Users with tokens can sponsor published scenarios (free access for everyone)
- Users cannot sponsor their own scenarios
- Duplicate sponsorships are prevented
- Sponsorships bypass the token check for chat creation
- Users can delete their own sponsorships
- All MQTT events for sponsorship operations are tracked

---

## Transactions

### USDC Blockchain Payments
- Text messages generate chatCompletion and embedding transactions
- TTS-enabled chats generate additional TTS transactions
- Sponsored scenarios bill the sponsor, not the user
- Guest (0 tokens) can chat on sponsored scenarios without spending
- Transaction amounts are in USDC wei (6 decimals)
- Users can only see transactions on their own messages
- Cross-user transaction access is forbidden
- All MQTT events for transaction processing are tracked

---

## Pictures

### Image Upload & Serving
- Authenticated users can upload pictures for entities (aiProvider, avatar, scenario, etc.)
- Exactly one entity ID must be provided per upload
- Pictures are processed with Sharp: resized to 2000px WebP on upload
- Pictures are served as WebP or JPEG with on-demand resizing (x, y params)
- **Different dimensions produce different file sizes** (resize verification)
- Default serving dimensions are 100x100
- Re-uploading for the same entity replaces the old picture
- Old pictures return 404 after replacement
- Pictures can be deleted
- Anonymous users cannot upload (401)
- Non-existent pictures return 404

---

## Filler Words

### TTS Filler Word Generation
- Users can create filler words for their avatars ("okay", "yeah", "so")
- Filler words trigger TTS audio generation via Kokoro
- Generated audio has .mp3 fileName
- Users can update filler word text (triggers re-generation)
- Users can delete filler words
- Users cannot create/delete filler words on another user's avatar (403)
- All MQTT events (create active+completed, update active+completed) are tracked

---

## Chat Completion Jobs

### LLM Job Tracking
- Chat completion jobs are created when messages are processed
- Jobs track input/output tokens, USD cost, and timing
- Jobs link to their chat model and AI provider
- Failed jobs (wrong model name) record error messages
- Users can list jobs by chatId and view by ID

---

## Embedding Jobs

### Vector Embedding Job Tracking
- Embedding jobs are created for text messages
- Jobs link to their embedding model and AI provider
- Failed jobs (wrong model name) record error messages
- Users can view embedding job details by ID

---

## Event Tracking

### MQTT Process Events
- Every create/update/delete operation publishes active+completed event pairs
- Events are scoped to user topics (users/{id}/processEvents)
- Events are scoped to chat topics (chats/{id}/processEvents)
- Events are scoped to doll topics (dolls/{id}/processEvents)
- Event arrays are verified empty at the end of each spec (no leaked events)
- Queue emptiness is verified via Redis BullMQ state (waitForQueuesEmpty)
