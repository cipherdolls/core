
import { describeAiProviders } from './aiProviders';
import { describeAuth } from './auth';
import { describeAvatars } from './avatars';
import { describeChatModels } from './chatModels';
import { describeChats } from './chats';
import { describeEmbeddingModels } from './embeddingModels';
import { describeMessages } from './messages';
import { describeReasoningModels } from './reasoningModels';
import { describeScenarios } from './scenarios';
import { describeSttProviders } from './sttProviders';
import { describeTokenPermits } from './tokenPermits';
import { describeTtsProviders } from './ttsProviders';
import { describeTtsVoices } from './ttsVoices';
import { setBeforeAll, setAfterAll } from './setup';
describe('messages (e2e)', () => {
  setBeforeAll();

  describeAuth();
  describeTokenPermits();
  describeTtsProviders();
  describeTtsVoices();
  describeSttProviders();
  describeAiProviders();
  describeChatModels();
  describeEmbeddingModels();
  describeReasoningModels();
  describeScenarios();
  describeAvatars();
  describeChats();
  describeMessages();

  setAfterAll();
});
