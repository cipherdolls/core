
import { describeAiProviders } from './aiProviders';
import { describeAuth } from './auth';
import { describeAvatars } from './avatars';
import { describeChatModels } from './chatModels';
import { describeEmbeddingModels } from './embeddingModels';
import { describeReasoningModels } from './reasoningModels';
import { describeScenarios } from './scenarios';
import { describeSponsorships } from './sponsorships';
import { describeSttProviders } from './sttProviders';
import { describeTokenPermits } from './tokenPermits';
import { describeTransactions } from './transactions';
import { describeTtsProviders } from './ttsProviders';
import { describeTtsVoices } from './ttsVoices';
import { setBeforeAll, setAfterAll } from './setup';
describe('Transactions Tests (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeTokenPermits();
  describeTtsProviders();
  describeTtsVoices();
  describeAiProviders();
  describeChatModels();
  describeEmbeddingModels();
  describeReasoningModels();
  describeSttProviders();
  describeScenarios();
  describeAvatars();
  describeSponsorships();
  describeTransactions();

  setAfterAll();
});
