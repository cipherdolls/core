
import { describeAiProviders } from './aiProviders';
import { describeAuth } from './auth';
import { describeChatModels } from './chatModels';
import { setBeforeAll, setAfterAll } from './setup';
describe('chatModels Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeAiProviders();
  describeChatModels();

  setAfterAll();
});
