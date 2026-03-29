
import { describeAiProviders } from './aiProviders';
import { describeAuth } from './auth';
import { describeReasoningModels } from './reasoningModels';
import { setBeforeAll, setAfterAll } from './setup';
describe('reasoningModels Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeAiProviders();
  describeReasoningModels();

  setAfterAll();
});
