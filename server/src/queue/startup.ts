import { registerWorker, closeAll } from './registry';
import {
  chatsProcessor,
  usersProcessor,
  messagesProcessor,
  charactersProcessor,
  aiProvidersProcessor,
  chatModelsProcessor,
  sttProvidersProcessor,
  ttsProvidersProcessor,
  ttsVoicesProcessor,
  chatCompletionProcessor,
  ttsJobsProcessor,
  sttJobsProcessor,
  picturesProcessor,
} from './processors';

/** Register all BullMQ workers. */
export function startWorkers() {
  console.log('Starting BullMQ workers...');

  registerWorker('chat', (job) => chatsProcessor.process(job));
  registerWorker('user', (job) => usersProcessor.process(job));
  registerWorker('message', (job) => messagesProcessor.process(job));
  registerWorker('character', (job) => charactersProcessor.process(job));
  registerWorker('aiProvider', (job) => aiProvidersProcessor.process(job));
  registerWorker('chatModel', (job) => chatModelsProcessor.process(job));
  registerWorker('sttProvider', (job) => sttProvidersProcessor.process(job));
  registerWorker('ttsProvider', (job) => ttsProvidersProcessor.process(job));
  registerWorker('ttsVoice', (job) => ttsVoicesProcessor.process(job));
  registerWorker('chatCompletion', (job) => chatCompletionProcessor.process(job));
  registerWorker('ttsJob', (job) => ttsJobsProcessor.process(job));
  registerWorker('sttJob', (job) => sttJobsProcessor.process(job));
  registerWorker('picture', (job) => picturesProcessor.process(job));

  console.log('All BullMQ workers registered.');
}

/** Graceful shutdown */
export async function stopWorkers() {
  await closeAll();
}
