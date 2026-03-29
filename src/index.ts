import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';

// BigInt JSON serialization
(BigInt.prototype as any).toJSON = function () { return Number(this); };
import { authRoutes } from './auth/routes';
import { usersRoutes } from './users/routes';
import { apiKeysRoutes } from './apiKeys/routes';
import { aiProvidersRoutes } from './aiProviders/routes';
import { chatModelsRoutes } from './chatModels/routes';
import { embeddingModelsRoutes } from './embeddingModels/routes';
import { reasoningModelsRoutes } from './reasoningModels/routes';
import { sttProvidersRoutes } from './sttProviders/routes';
import { ttsProvidersRoutes } from './ttsProviders/routes';
import { ttsVoicesRoutes } from './ttsVoices/routes';
import { scenariosRoutes } from './scenarios/routes';
import { avatarsRoutes } from './avatars/routes';
import { chatsRoutes } from './chats/routes';
import { messagesRoutes } from './messages/routes';
import { dollsRoutes } from './dolls/routes';
import { dollBodiesRoutes } from './dollBodies/routes';
import { transactionsRoutes } from './transactions/routes';
import { sponsorshipsRoutes } from './sponsorships/routes';
import { tokenPermitsRoutes } from './tokenPermits/routes';
import { firmwaresRoutes } from './firmwares/routes';
import { tokenRoutes } from './token/routes';
import { startWorkers, stopWorkers } from './queue/startup';
import { startBroker, stopBroker } from './mqtt/broker';
import { startMqttClient, stopMqttClient } from './mqtt/client';

const port = process.env.PORT ?? 4000;

const app = new Elysia({ normalize: true })
  .use(cors())
  .use(swagger({ path: '/api' }))
  .onError(({ error, set }) => {
    const status = (set.status as number) ?? 500;
    if (error.message === 'Missing authorization token' || error.message === 'Invalid authorization token') {
      set.status = 401;
      return { statusCode: 401, message: error.message };
    }
    if (error.message === 'Admin access required') {
      set.status = 403;
      return { statusCode: 403, message: error.message };
    }
    return { statusCode: status, message: error.message };
  })
  .use(authRoutes)
  .use(usersRoutes)
  .use(apiKeysRoutes)
  .use(aiProvidersRoutes)
  .use(chatModelsRoutes)
  .use(embeddingModelsRoutes)
  .use(reasoningModelsRoutes)
  .use(sttProvidersRoutes)
  .use(ttsProvidersRoutes)
  .use(ttsVoicesRoutes)
  .use(scenariosRoutes)
  .use(avatarsRoutes)
  .use(chatsRoutes)
  .use(messagesRoutes)
  .use(dollsRoutes)
  .use(dollBodiesRoutes)
  .use(transactionsRoutes)
  .use(sponsorshipsRoutes)
  .use(tokenPermitsRoutes)
  .use(firmwaresRoutes)
  .use(tokenRoutes)
  .listen(port);

// Start MQTT broker + client
await startBroker();
startMqttClient();

// Start BullMQ workers (only if WORKER=true)
startWorkers();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await stopWorkers();
  stopMqttClient();
  await stopBroker();
  process.exit(0);
});

console.log(`Core running on http://localhost:${port}`);
console.log(`Swagger docs at http://localhost:${port}/api`);

export type App = typeof app;
