
import { describeAiProviders } from './aiProviders';
import { describeAuth } from './auth';
import { describeEmbeddingModels } from './embeddingModels';
import { setBeforeAll, setAfterAll } from './setup';
describe('chatModels Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeAiProviders();
  describeEmbeddingModels();

  setAfterAll();
});
