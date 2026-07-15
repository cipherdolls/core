import { describeAiProviders } from './aiProviders';
import { describeAuth } from './auth';
import { describeAvatars } from './avatars';
import { describeChatModels } from './chatModels';
import { describeEmbeddingModels } from './embeddingModels';
import { describeReasoningModels } from './reasoningModels';
import { describeScenarios } from './scenarios';
import { describeTokenPermits } from './tokenPermits';
import { describeTtsProviders } from './ttsProviders';
import { describeTtsVoices } from './ttsVoices';
import { describeGroups } from './groups';
import { setBeforeAll, setAfterAll } from './setup';
describe('groups Controller (e2e)', () => {
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
  describeGroups();

  setAfterAll();
});
