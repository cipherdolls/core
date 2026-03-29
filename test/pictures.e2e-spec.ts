
import { describeAuth } from './auth';
import { describeAiProviders } from './aiProviders';
import { describeTtsProviders } from './ttsProviders';
import { describePictures } from './pictures';
import { setBeforeAll, setAfterAll } from './setup';

describe('pictures Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeAiProviders();
  describeTtsProviders();
  describePictures();

  setAfterAll();
});
