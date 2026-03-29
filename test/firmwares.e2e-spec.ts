
import { describeAiProviders } from './aiProviders';
import { describeAuth } from './auth';
import { describeAvatars } from './avatars';
import { describeChatModels } from './chatModels';
import { describeDollBodies } from './dollBodies';
import { describeEmbeddingModels } from './embeddingModels';
import { describeFirmwares } from './firmwares';
import { describeReasoningModels } from './reasoningModels';
import { describeScenarios } from './scenarios';
import { describeTokenPermits } from './tokenPermits';
import { describeTtsProviders } from './ttsProviders';
import { describeTtsVoices } from './ttsVoices';
import { setBeforeAll, setAfterAll } from './setup';
describe('Firmwares Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeTokenPermits();
  describeAiProviders();
  describeChatModels();
  describeEmbeddingModels();
  describeReasoningModels();
  describeTtsProviders();
  describeTtsVoices();
  describeScenarios();
  describeAvatars();
  describeDollBodies();
  describeFirmwares();

  setAfterAll();
});
