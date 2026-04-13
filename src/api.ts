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
import { chatCompletionJobsRoutes } from './chatCompletionJobs/routes';
import { embeddingJobsRoutes } from './embeddingJobs/routes';
import { fillerWordsRoutes } from './fillerWords/routes';
import { firmwaresRoutes } from './firmwares/routes';
import { knowledgeBasesRoutes } from './knowledgeBases/routes';
import { picturesRoutes } from './pictures/routes';
import { audiosRoutes } from './audios/routes';
import { tokenRoutes } from './token/routes';
const port = process.env.PORT ?? 4000;

const app = new Elysia({ normalize: true })
  .use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }))
  .use(swagger({ path: '/api', documentation: { info: { title: 'CipherDolls API', version: process.env.COMMIT_SHA ?? 'dev' } } }))
  .onError(({ error, set }) => {
    const status = (set.status as number) ?? 500;
    const message = 'message' in error ? (error as any).message : '';
    if (message === 'Missing authorization token' || message === 'Invalid authorization token') {
      set.status = 401;
      return { statusCode: 401, message };
    }
    if (message === 'Admin access required') {
      set.status = 403;
      return { statusCode: 403, message };
    }
    return { statusCode: status, message };
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
  .use(chatCompletionJobsRoutes)
  .use(embeddingJobsRoutes)
  .use(fillerWordsRoutes)
  .use(firmwaresRoutes)
  .use(knowledgeBasesRoutes)
  .use(picturesRoutes)
  .use(audiosRoutes)
  .use(tokenRoutes)
  .listen(port);

process.on('SIGTERM', async () => {
  process.exit(0);
});

console.log(`API running on http://localhost:${port} (commit: ${process.env.COMMIT_SHA ?? 'dev'})`);
console.log(`Swagger docs at http://localhost:${port}/api`);

export type App = typeof app;
