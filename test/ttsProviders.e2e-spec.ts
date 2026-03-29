
import { describeAuth } from './auth';
import { describeTtsProviders } from './ttsProviders';
import { setBeforeAll, setAfterAll } from './setup';

describe('ttsProvider Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeTtsProviders();

  setAfterAll();
});
