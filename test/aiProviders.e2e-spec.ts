
import { describeAiProviders } from './aiProviders';
import { describeAuth } from './auth';
import { setBeforeAll, setAfterAll } from './setup';

describe('aiProvider Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeAiProviders();

  setAfterAll();
});
