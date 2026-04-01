
import { describeAuth } from './auth';
import { describeAiProviders } from './aiProviders';
import { describeChatModels } from './chatModels';
import { describeEmbeddingModels } from './embeddingModels';
import { describeReasoningModels } from './reasoningModels';
import { describeTtsProviders } from './ttsProviders';
import { describeTtsVoices } from './ttsVoices';
import { describeTokenPermits } from './tokenPermits';
import { describeScenarios } from './scenarios';
import { describeAvatars } from './avatars';
import { describeAudios } from './audios';
import { setBeforeAll, setAfterAll } from './setup';

describe('audios Controller (e2e)', () => {
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
  describeAudios();

  setAfterAll();
});
