import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';

// BigInt JSON serialization
(BigInt.prototype as any).toJSON = function () { return Number(this); };
import { authRoutes } from './auth/routes';
import { usersRoutes } from './users/routes';
import { aiProvidersRoutes } from './aiProviders/routes';
import { chatModelsRoutes } from './chatModels/routes';
import { sttProvidersRoutes } from './sttProviders/routes';
import { ttsProvidersRoutes } from './ttsProviders/routes';
import { ttsVoicesRoutes } from './ttsVoices/routes';
import { charactersRoutes } from './characters/routes';
import { chatsRoutes } from './chats/routes';
import { messagesRoutes } from './messages/routes';
import { chatCompletionRoutes } from './chatCompletion/routes';
import { picturesRoutes } from './pictures/routes';

const port = process.env.PORT ?? 4000;

const app = new Elysia({ normalize: true })
  .use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }))
  .use(swagger({ path: '/api', documentation: { info: { title: 'CipherDolls Server API', version: process.env.COMMIT_SHA ?? 'dev' } } }))
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
  .use(aiProvidersRoutes)
  .use(chatModelsRoutes)
  .use(sttProvidersRoutes)
  .use(ttsProvidersRoutes)
  .use(ttsVoicesRoutes)
  .use(charactersRoutes)
  .use(chatsRoutes)
  .use(messagesRoutes)
  .use(chatCompletionRoutes)
  .use(picturesRoutes)
  .listen(port);

process.on('SIGTERM', async () => {
  process.exit(0);
});

console.log(`API running on http://localhost:${port} (commit: ${process.env.COMMIT_SHA ?? 'dev'})`);
console.log(`Swagger docs at http://localhost:${port}/api`);

export type App = typeof app;
