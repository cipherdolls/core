
import { describeAuth } from './auth';
import { setBeforeAll, setAfterAll } from './setup';

describe('auth Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();

  setAfterAll();
});
