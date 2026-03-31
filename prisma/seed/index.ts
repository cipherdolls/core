import { PrismaClient } from '@prisma/client';
import {
  aiProviderGroqSeed,
  aiProviderMixedbreadSeed,
  aiProviderOllamaChatSeed,
  aiProviderOllamaReasoningSeed,
  aiProviderOllamaEmbeddingSeed,
  aiProviderOpenRouterSeed,
  chatModel_groq_llama_3_3_70b_versatile_Seed,
  chatModelDeepseekOpenRouterSeed,
  chatModelLlama32_1bOllamaSeed,
  chatModelMagnumV4MistralSmallOllamaSeed,
  chatModelMythomaxOpenRouterSeed,
  embeddingModelMxbaiLargeMixedbreadSeed,
  embeddingModelAllMinilm22mOllamaSeed,
  reasoningModelPhi4MiniOllamaSeed,
} from './aiProviders';
import { sttProviderAssemblyAISeed, sttProviderGroqWhisperSeed, sttProviderLocalWhisperSeed } from './stt';
import {
  ttsProviderKokoroSeed,
  ttsProviderElevenLabsSeed,
  ttsProviderUnrealspeechSeed,
  ttsVoiceKokoroHeartSeed,
  ttsVoiceKokoroBellaSeed,
  ttsVoiceKokoroNicoleSeed,
  ttsVoiceElevenLabsAllisonSeed,
  ttsVoiceElevenLabsBiancaSeed,
  ttsVoiceElevenLabsJoanneSeed,
  ttsVoiceElevenLabsKawaiiSeed,
  ttsVoiceElevenLabsLenaSeed,
  ttsVoiceElevenLabsMyriamSeed,
  ttsVoiceElevenLabsNanaSeed,
  ttsVoiceElevenLabsNatashaSeed,
  ttsVoiceUnrealspeechAmySeed,
  ttsVoiceUnrealspeechLivSeed,
  ttsVoiceUnrealspeechScarlettSeed,
} from './tts';

import { joiAvatarSeed, freyaAvatarSeed, hanaAvatarSeed } from './avatar';
import { deepTalkSeed, smallTalkSeed, unfriendlyTalkSeed, applePieObsessedSeed, alienBelieverSeed } from './scenario';
import { dollBodySenseCapWatcher } from './dollBody';

const prisma = new PrismaClient();
async function main() {
  const masterWalletAddress = process.env.MASTER_WALLET_ADDRESS;
  const admin = await prisma.user.create({
    data: {
      name: 'Admin',
      signerAddress: masterWalletAddress,
      role: 'ADMIN',
    },
  });

  const aliceWalletAddress = process.env.ALICE_WALLET_ADDRESS;
  const alice = await prisma.user.create({
    data: {
      name: 'Alice',
      signerAddress: aliceWalletAddress,
    },
  });

  const bobWalletAddress = process.env.BOB_WALLET_ADDRESS;
  const bob = await prisma.user.create({
    data: {
      name: 'Bob',
      signerAddress: bobWalletAddress,
    },
  });

  // LLM Mixedbread
  const aiProviderMixedbread = await prisma.aiProvider.create({
    data: {
      ...aiProviderMixedbreadSeed,
      apiKey: process.env.MIXEDBREAD_API_KEY,
      user: { connect: { id: admin.id } },
    },
  });
  const embeddingModelMxbaiLargeMixedbread = await prisma.embeddingModel.create({
    data: {
      ...embeddingModelMxbaiLargeMixedbreadSeed,
      aiProvider: { connect: { id: aiProviderMixedbread.id } },
    },
  });

  // LLM Groq
  const aiProviderGroq = await prisma.aiProvider.create({
    data: {
      ...aiProviderGroqSeed,
      apiKey: process.env.GROQ_API_KEY,
      user: { connect: { id: admin.id } },
    },
  });
  await prisma.chatModel.create({
    data: {
      ...chatModel_groq_llama_3_3_70b_versatile_Seed,
      aiProvider: { connect: { id: aiProviderGroq.id } },
    },
  });

  // LLM Ollama Chat
  const aiProviderOllamaChat = await prisma.aiProvider.create({
    data: {
      ...aiProviderOllamaChatSeed,
      apiKey: 'fake-api-key',
      user: { connect: { id: admin.id } },
    },
  });

  const chatModelLlama32Ollama = await prisma.chatModel.create({
    data: {
      ...chatModelLlama32_1bOllamaSeed,
      dollarPerInputToken: 0,
      dollarPerOutputToken: 0,
      aiProvider: { connect: { id: aiProviderOllamaChat.id } },
    },
  });

  // LLM Ollama Reasoning
  const aiProviderOllamaReasoning = await prisma.aiProvider.create({
    data: {
      ...aiProviderOllamaReasoningSeed,
      apiKey: 'fake-api-key',
      user: { connect: { id: admin.id } },
    },
  });

  const reasoningModelQwen35Ollama = await prisma.reasoningModel.create({
    data: {
      ...reasoningModelPhi4MiniOllamaSeed,
      dollarPerInputToken: 0,
      dollarPerOutputToken: 0,
      aiProvider: { connect: { id: aiProviderOllamaReasoning.id } },
    },
  });

  // LLM Ollama Embedding
  const aiProviderOllamaEmbedding = await prisma.aiProvider.create({
    data: {
      ...aiProviderOllamaEmbeddingSeed,
      apiKey: 'fake-api-key',
      user: { connect: { id: admin.id } },
    },
  });

  const embeddingModelAllMinilmOllama = await prisma.embeddingModel.create({
    data: {
      ...embeddingModelAllMinilm22mOllamaSeed,
      dollarPerInputToken: 0,
      aiProvider: { connect: { id: aiProviderOllamaEmbedding.id } },
    },
  });

  // LLM OpenRouter
  const aiProviderOpenRouter = await prisma.aiProvider.create({
    data: {
      ...aiProviderOpenRouterSeed,
      apiKey: process.env.OPENROUTER_API_KEY,
      user: { connect: { id: admin.id } },
    },
  });
  const chatModelMythomaxOpenRouter = await prisma.chatModel.create({
    data: {
      ...chatModelMythomaxOpenRouterSeed,
      aiProvider: { connect: { id: aiProviderOpenRouter.id } },
    },
  });
  const chatModelDeepseekOpenRouter = await prisma.chatModel.create({
    data: {
      ...chatModelDeepseekOpenRouterSeed,
      aiProvider: { connect: { id: aiProviderOpenRouter.id } },
    },
  });
  const chatModelMagnumV4MistralSmallOllama = await prisma.chatModel.create({
    data: {
      ...chatModelMagnumV4MistralSmallOllamaSeed,
      dollarPerInputToken: 0,
      dollarPerOutputToken: 0,
      aiProvider: { connect: { id: aiProviderOllamaChat.id } },
    },
  });

  // STT
  const sttProviderAssemblyAI = await prisma.sttProvider.create({
    data: {
      ...sttProviderAssemblyAISeed,
      user: { connect: { id: admin.id } },
    },
  });
  const sttProviderGroqWhisper = await prisma.sttProvider.create({
    data: {
      ...sttProviderGroqWhisperSeed,
      user: { connect: { id: admin.id } },
    },
  });
  const sttProviderLocalWhisper = await prisma.sttProvider.create({
    data: {
      ...sttProviderLocalWhisperSeed,
      dollarPerSecond: 0,
      recommended: true,
      user: { connect: { id: admin.id } },
    },
  });

  //Unrealspeech
  const ttsProviderUnrealspeech = await prisma.ttsProvider.create({
    data: {
      ...ttsProviderUnrealspeechSeed,
      user: { connect: { id: admin.id } },
    },
  });
  const ttsVoiceUnrealspeechScarlett = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceUnrealspeechScarlettSeed,
      ttsProvider: { connect: { id: ttsProviderUnrealspeech.id } },
    },
  });
  const ttsVoiceUnrealspeechLiv = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceUnrealspeechLivSeed,
      ttsProvider: { connect: { id: ttsProviderUnrealspeech.id } },
    },
  });
  const ttsVoiceUnrealspeechAmy = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceUnrealspeechAmySeed,
      ttsProvider: { connect: { id: ttsProviderUnrealspeech.id } },
    },
  });

  // TTS ElevenLabs
  const ttsProviderElevenLabs = await prisma.ttsProvider.create({
    data: {
      ...ttsProviderElevenLabsSeed,
      user: { connect: { id: admin.id } },
    },
  });
  const ttsElevenLabsVoiceMyriam = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceElevenLabsMyriamSeed,
      ttsProvider: { connect: { id: ttsProviderElevenLabs.id } },
    },
  });
  const ttsElevenLabsVoiceLena = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceElevenLabsLenaSeed,
      ttsProvider: { connect: { id: ttsProviderElevenLabs.id } },
    },
  });
  const ttsElevenLabsVoiceNatasha = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceElevenLabsNatashaSeed,
      ttsProvider: { connect: { id: ttsProviderElevenLabs.id } },
    },
  });
  const ttsElevenLabsVoiceAllison = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceElevenLabsAllisonSeed,
      ttsProvider: { connect: { id: ttsProviderElevenLabs.id } },
    },
  });
  const ttsElevenLabsVoiceBianca = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceElevenLabsBiancaSeed,
      ttsProvider: { connect: { id: ttsProviderElevenLabs.id } },
    },
  });
  const ttsElevenLabsVoiceKawaii = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceElevenLabsKawaiiSeed,
      ttsProvider: { connect: { id: ttsProviderElevenLabs.id } },
    },
  });
  const ttsElevenLabsVoiceNana = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceElevenLabsNanaSeed,
      ttsProvider: { connect: { id: ttsProviderElevenLabs.id } },
    },
  });
  const ttsElevenLabsVoiceJoanne = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceElevenLabsJoanneSeed,
      ttsProvider: { connect: { id: ttsProviderElevenLabs.id } },
    },
  });

  // TTS Kokoro
  const ttsKokoroProvider = await prisma.ttsProvider.create({
    data: {
      ...ttsProviderKokoroSeed,
      dollarPerCharacter: 0,
      user: { connect: { id: admin.id } },
    },
  });
  const ttsKokoroVoiceHeart = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceKokoroHeartSeed,
      ttsProvider: { connect: { id: ttsKokoroProvider.id } },
    },
  });
  const ttsKokoroVoiceBella = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceKokoroBellaSeed,
      ttsProvider: { connect: { id: ttsKokoroProvider.id } },
    },
  });
  const ttsKokoroVoiceNicole = await prisma.ttsVoice.create({
    data: {
      ...ttsVoiceKokoroNicoleSeed,
      ttsProvider: { connect: { id: ttsKokoroProvider.id } },
    },
  });

  const smallTalkScenario = await prisma.scenario.create({
    data: {
      ...smallTalkSeed,
      published: true,
      recommended: true,
      chatModel: { connect: { id: chatModelLlama32Ollama.id } },
      embeddingModel: { connect: { id: embeddingModelAllMinilmOllama.id } },
      reasoningModel: { connect: { id: reasoningModelQwen35Ollama.id } },
      user: { connect: { id: admin.id } },
    },
  });

  const deepTalkScenario = await prisma.scenario.create({
    data: {
      ...deepTalkSeed,
      published: true,
      chatModel: { connect: { id: chatModelMagnumV4MistralSmallOllama.id } },
      user: { connect: { id: admin.id } },
    },
  });

  const unfriendlyTalkScenario = await prisma.scenario.create({
    data: {
      ...unfriendlyTalkSeed,
      published: true,
      chatModel: { connect: { id: chatModelMagnumV4MistralSmallOllama.id } },
      user: { connect: { id: admin.id } },
    },
  });

  const hanaAvatar = await prisma.avatar.create({
    data: {
      ...hanaAvatarSeed,
      published: true,
      language: 'en',
      ttsVoice: { connect: { id: ttsKokoroVoiceHeart.id } },
      user: { connect: { id: alice.id } },
      scenarios: {
        connect: [
          { id: smallTalkScenario.id },
          { id: deepTalkScenario.id },
          { id: unfriendlyTalkScenario.id },
        ],
      },
    },
  });

  const freyaAvatar = await prisma.avatar.create({
    data: {
      ...freyaAvatarSeed,
      published: true,
      language: 'en',
      ttsVoice: { connect: { id: ttsKokoroVoiceBella.id } },
      user: { connect: { id: alice.id } },
      scenarios: {
        connect: [
          { id: smallTalkScenario.id },
          { id: deepTalkScenario.id },
          { id: unfriendlyTalkScenario.id },
        ],
      },
    },
  });

  const joiAvatar = await prisma.avatar.create({
    data: {
      ...joiAvatarSeed,
      published: true,
      language: 'en',
      ttsVoice: { connect: { id: ttsKokoroVoiceNicole.id } },
      user: { connect: { id: alice.id } },
      scenarios: {
        connect: [
          { id: smallTalkScenario.id },
          { id: deepTalkScenario.id },
          { id: unfriendlyTalkScenario.id },
        ],
      },
    },
  });

  const smartWigHana = await prisma.dollBody.create({
    data: {
      ...dollBodySenseCapWatcher,
      avatar: { connect: { id: hanaAvatar.id } },
    },
  });

}
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
