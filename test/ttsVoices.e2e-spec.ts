
import { describeAuth } from './auth';
import { describeTtsProviders } from './ttsProviders';
import { describeTtsVoices } from './ttsVoices';
import { setBeforeAll, setAfterAll } from './setup';
describe('ttsVoices Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeTtsProviders();
  describeTtsVoices();

  setAfterAll();
});
