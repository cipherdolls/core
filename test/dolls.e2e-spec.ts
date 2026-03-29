
import { describeAiProviders } from './aiProviders';
import { describeAuth } from './auth';
import { describeAvatars } from './avatars';
import { describeChatModels } from './chatModels';
import { describeDollBodies } from './dollBodies';
import { describeDolls } from './dolls';
import { describeEmbeddingModels } from './embeddingModels';
import { describeReasoningModels } from './reasoningModels';
import { describeScenarios } from './scenarios';
import { describeSttProviders } from './sttProviders';
import { describeTokenPermits } from './tokenPermits';
import { describeTtsProviders } from './ttsProviders';
import { describeTtsVoices } from './ttsVoices';
import { setBeforeAll, setAfterAll } from './setup';
describe('dolls Controller (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeTokenPermits();
  describeAiProviders();
  describeChatModels();
  describeEmbeddingModels();
  describeReasoningModels();
  describeTtsProviders();
  describeTtsVoices();
  describeSttProviders();
  describeScenarios();
  describeAvatars();
  describeDollBodies();
  describeDolls();

  setAfterAll();
});
