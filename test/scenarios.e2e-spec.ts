
import { describeAiProviders } from './aiProviders';
import { describeAuth } from './auth';
import { describeChatModels } from './chatModels';
import { describeEmbeddingModels } from './embeddingModels';
import { describeReasoningModels } from './reasoningModels';
import { describeScenarios } from './scenarios';
import { describeTokenPermits } from './tokenPermits';
import { setBeforeAll, setAfterAll } from './setup';
describe('scenarios Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeTokenPermits();
  describeAiProviders();
  describeChatModels();
  describeEmbeddingModels();
  describeReasoningModels();
  describeScenarios();

  setAfterAll();
});
