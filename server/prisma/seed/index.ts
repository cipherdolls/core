import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Minimal seed: one admin user, one OpenAI-compatible chat model,
 * one Groq Whisper STT provider, one Kokoro TTS provider + voice,
 * and one Character that ties the voice + model together.
 *
 * Provider endpoints / keys come from env so the seed works against any
 * OpenAI-compatible LLM (OpenAI, OpenRouter, Ollama, ...).
 */
async function main() {
  const admin = await prisma.user.create({
    data: {
      name: 'Admin',
      signerAddress: process.env.MASTER_WALLET_ADDRESS ?? '0x0000000000000000000000000000000000000001',
      role: 'ADMIN',
    },
  });

  // ── LLM: one OpenAI-compatible provider + one chat model ──
  const aiProvider = await prisma.aiProvider.create({
    data: {
      name: 'OpenAI',
      apiKey: process.env.OPENAI_API_KEY ?? 'sk-placeholder',
      basePath: process.env.OPENAI_BASE_PATH ?? 'https://api.openai.com/v1',
      user: { connect: { id: admin.id } },
    },
  });

  const chatModel = await prisma.chatModel.create({
    data: {
      providerModelName: process.env.CHAT_MODEL ?? 'gpt-4o-mini',
      info: 'Default chat model',
      contextWindow: 128000,
      recommended: true,
      aiProvider: { connect: { id: aiProvider.id } },
    },
  });

  // ── STT: Groq Whisper (the sttJobs processor matches on this name) ──
  await prisma.sttProvider.create({
    data: {
      name: 'GroqWhisper',
      recommended: true,
      user: { connect: { id: admin.id } },
    },
  });

  // ── TTS: Kokoro + one voice ──
  const kokoro = await prisma.ttsProvider.create({
    data: {
      name: 'Kokoro',
      user: { connect: { id: admin.id } },
    },
  });

  const voice = await prisma.ttsVoice.create({
    data: {
      name: 'Heart',
      providerVoiceId: 'af_heart',
      recommended: true,
      gender: 'Female',
      language: 'en',
      ttsProvider: { connect: { id: kokoro.id } },
    },
  });

  // ── Character: merged avatar + scenario ──
  await prisma.character.create({
    data: {
      name: 'Hana',
      shortDesc: 'A warm and curious companion.',
      character: 'You are Hana, a warm, witty and curious companion who loves getting to know people.',
      greeting: 'Hi there! I\'m Hana. What\'s on your mind today?',
      type: 'NORMAL',
      systemMessage: 'Have a friendly, casual conversation. Be supportive and ask follow-up questions.',
      language: 'en',
      gender: 'Female',
      published: true,
      recommended: true,
      user: { connect: { id: admin.id } },
      ttsVoice: { connect: { id: voice.id } },
      chatModel: { connect: { id: chatModel.id } },
    },
  });

  console.log('Seed complete.');
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
