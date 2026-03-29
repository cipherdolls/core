
import { describeAiProviders } from './aiProviders';
import { describeAuth } from './auth';
import { describeChatModels } from './chatModels';
import { describeTokenPermits } from './tokenPermits';
import { setBeforeAll, setAfterAll } from './setup';

describe('TokenPermits Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeTokenPermits();

  setAfterAll();
});
