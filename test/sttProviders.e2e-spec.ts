
import { describeAuth } from './auth';
import { describeSttProviders } from './sttProviders';
import { setBeforeAll, setAfterAll } from './setup';

describe('sttProviders Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeSttProviders();

  setAfterAll();
});
