import type { Job } from 'bullmq';
import { BaseProcessor } from './processor';

/** Simple processor that just logs CUD events. Used for domains that don't need custom logic yet. */
class StubProcessor extends BaseProcessor<any> {
  constructor(name: string) {
    super(name, []);
  }
}

// Domains with custom processors
export { chatsProcessor } from '../chats/processor';
export { usersProcessor } from '../users/processor';
export { messagesProcessor } from '../messages/processor';

// Stub processors for domains that don't need custom logic yet
export { dollsProcessor } from '../dolls/processor';
export const dollBodiesProcessor = new StubProcessor('dollBody');
export { avatarsProcessor } from '../avatars/processor';
export { scenariosProcessor } from '../scenarios/processor';
export const aiProvidersProcessor = new StubProcessor('aiProvider');
export { chatModelsProcessor } from '../chatModels/processor';
export { embeddingModelsProcessor } from '../embeddingModels/processor';
export { reasoningModelsProcessor } from '../reasoningModels/processor';
export const sttProvidersProcessor = new StubProcessor('sttProvider');
export { ttsProvidersProcessor } from '../ttsProviders/processor';
export { ttsVoicesProcessor } from '../ttsVoices/processor';
export { transactionsProcessor } from '../transactions/processor';
export { chatCompletionJobsProcessor } from '../chatCompletionJobs/processor';
export { ttsJobsProcessor } from '../ttsJobs/processor';
export { sponsorshipsProcessor } from '../sponsorships/processor';
export { tokenPermitsProcessor } from '../tokenPermits/processor';
export { embeddingJobsProcessor } from '../embeddingJobs/processor';
export { sttJobsProcessor } from '../sttJobs/processor';
export { fillerWordsProcessor } from '../fillerWords/processor';
export { picturesProcessor } from '../pictures/processor';
export const firmwaresProcessor = new StubProcessor('firmware');
