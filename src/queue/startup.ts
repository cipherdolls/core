import { registerWorker, closeAll } from './registry';
import {
  chatsProcessor,
  usersProcessor,
  messagesProcessor,
  dollsProcessor,
  dollBodiesProcessor,
  avatarsProcessor,
  scenariosProcessor,
  aiProvidersProcessor,
  chatModelsProcessor,
  embeddingModelsProcessor,
  reasoningModelsProcessor,
  sttProvidersProcessor,
  ttsProvidersProcessor,
  ttsVoicesProcessor,
  transactionsProcessor,
  chatCompletionJobsProcessor,
  ttsJobsProcessor,
  embeddingJobsProcessor,
  sponsorshipsProcessor,
  tokenPermitsProcessor,
  firmwaresProcessor,
} from './processors';

const IS_WORKER = process.env.WORKER === 'true';

/** Register all BullMQ workers. Only runs in worker mode. */
export function startWorkers() {
  if (!IS_WORKER) {
    console.log('Worker mode disabled (WORKER != true). Queues active, workers skipped.');
    return;
  }

  console.log('Starting BullMQ workers...');

  registerWorker('chat', (job) => chatsProcessor.process(job));
  registerWorker('user', (job) => usersProcessor.process(job));
  registerWorker('message', (job) => messagesProcessor.process(job));
  registerWorker('doll', (job) => dollsProcessor.process(job));
  registerWorker('dollBody', (job) => dollBodiesProcessor.process(job));
  registerWorker('avatar', (job) => avatarsProcessor.process(job));
  registerWorker('scenario', (job) => scenariosProcessor.process(job));
  registerWorker('aiProvider', (job) => aiProvidersProcessor.process(job));
  registerWorker('chatModel', (job) => chatModelsProcessor.process(job));
  registerWorker('embeddingModel', (job) => embeddingModelsProcessor.process(job));
  registerWorker('reasoningModel', (job) => reasoningModelsProcessor.process(job));
  registerWorker('sttProvider', (job) => sttProvidersProcessor.process(job));
  registerWorker('ttsProvider', (job) => ttsProvidersProcessor.process(job));
  registerWorker('ttsVoice', (job) => ttsVoicesProcessor.process(job));
  registerWorker('transaction', (job) => transactionsProcessor.process(job));
  registerWorker('chatCompletionJob', (job) => chatCompletionJobsProcessor.process(job));
  registerWorker('ttsJob', (job) => ttsJobsProcessor.process(job));
  registerWorker('embeddingJob', (job) => embeddingJobsProcessor.process(job));
  registerWorker('sponsorship', (job) => sponsorshipsProcessor.process(job));
  registerWorker('tokenPermit', (job) => tokenPermitsProcessor.process(job));
  registerWorker('firmware', (job) => firmwaresProcessor.process(job));

  console.log('All BullMQ workers registered.');
}

/** Graceful shutdown */
export async function stopWorkers() {
  await closeAll();
}
