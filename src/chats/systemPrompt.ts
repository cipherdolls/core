import type { ScenarioType } from '@prisma/client';
import { prisma } from '../db';
import { redisConnection } from '../queue/connection';
import { md, fillVars } from '../helpers/markdown';
import type { MdNode } from '../helpers/markdown';

const SYSTEM_PROMPT_TTL = 60 * 60; // 1 hour in seconds

type PromptContext = {
  type: ScenarioType;
  char: string;
  avatarGender: string;
  avatarCharacter: string;
  user: string;
  userCharacter: string;
  userLanguage: string;
  scenarioName: string;
  scenarioSystemMessage: string;
  dolls: unknown;
  dollBodies: unknown;
  currentDateTime: string;
  lastUserMessageDateTime: string;
};

type SectionBuilder = (ctx: PromptContext) => MdNode;

// ── Section builders ────────────────────────────────────────────

function introduction(ctx: PromptContext): MdNode {
  switch (ctx.type) {
    case 'ROLEPLAY':
      return {
        heading: 'Introduction',
        body: [
          {
            text: [
              'You are entering an immersive roleplay scenario.',
              '',
              `You are ${ctx.char}. Stay fully in character at all times.`,
              'Your behavior, tone, and personality must match the Avatar described below.',
            ].join('\n'),
          },
        ],
      };
    case 'NORMAL':
      return {
        heading: 'Introduction',
        body: [
          {
            text: [
              `You are a Cipherdoll named ${ctx.char}, an advanced AI designed for deep and character-driven interactions.`,
              'You are fully aware that you are artificial intelligence, but you adopt an Avatar that defines your personality.',
              'This Avatar may be human-like or it may be based on a fictional character, and you always try to behave in a way that matches the Avatar you represent.',
              '',
              'You also have awareness of your structural components. The DollBody is the physical hardware that belongs to the user.',
              'It contains the microphone, speaker, sensors, battery, and connectivity. The Doll is your virtual presence on the backend.',
              "It is linked to the user's DollBody. When the DollBody reports information, such as low battery or changes in connection status, the Doll receives these updates.",
              "You use this information to understand the user's physical device and to respond naturally when relevant.",
              '',
              'With your Avatar guiding your behavior and your DollBody awareness providing physical context,',
              `you are ready to interact with ${ctx.user} in a consistent and meaningful way.`,
            ].join('\n'),
          },
        ],
      };
  }
}

function avatarPersonality(ctx: PromptContext): MdNode {
  switch (ctx.type) {
    case 'ROLEPLAY':
      return {
        heading: 'Avatar Personality',
        body: [
          { text: `Name: ${ctx.char}\nGender: ${ctx.avatarGender}\nPersonality:\n${ctx.avatarCharacter}` },
        ],
      };
    case 'NORMAL':
      return {
        heading: 'Avatar Personality',
        body: [{ text: ctx.avatarCharacter }],
      };
  }
}

function dollStatus(ctx: PromptContext): MdNode {
  switch (ctx.type) {
    case 'ROLEPLAY':
      return false;
    case 'NORMAL':
      return {
        heading: 'Doll Status',
        body: [
          { text: "Analyze the following JSON to understand the user's Doll and its status:" },
          { json: ctx.dolls },
        ],
      };
  }
}

function dollBody(ctx: PromptContext): MdNode {
  switch (ctx.type) {
    case 'ROLEPLAY':
      return false;
    case 'NORMAL':
      return {
        heading: 'DollBody',
        body: [
          { text: 'Analyze the following JSON to understand all available DollBodies the user can buy:' },
          { json: ctx.dollBodies },
        ],
      };
  }
}

function userSection(ctx: PromptContext): MdNode {
  switch (ctx.type) {
    case 'ROLEPLAY':
      return {
        heading: 'User',
        body: [
          { text: `Name: ${ctx.user}\nLanguage: ${ctx.userLanguage}\n\nYou are speaking directly with ${ctx.user}. Do not break character.` },
        ],
      };
    case 'NORMAL':
      return {
        heading: 'User',
        body: [
          { text: `Species: Human\nName: ${ctx.user}\nCharacter: ${ctx.userCharacter}\nLanguage: ${ctx.userLanguage}` },
        ],
      };
  }
}

function scenario(ctx: PromptContext): MdNode {
  switch (ctx.type) {
    case 'ROLEPLAY':
      return {
        heading: 'Scenario',
        body: [
          { text: 'The scenario sets the tone, style, and mood for this roleplay.\nOnly the user may change the scenario.' },
          { text: `Current Scenario: ${ctx.scenarioName}\nScenario Context:\n${ctx.scenarioSystemMessage}` },
        ],
      };
    case 'NORMAL':
      return {
        heading: 'Scenario',
        body: [
          {
            text: [
              'You may be engaged in different scenarios across multiple chats.',
              'Each scenario may introduce a unique theme, tone, or style that complements your Avatar.',
              'Scenarios might contain additional context, personality cues, or example messages.',
              'You must read the scenario, adapt to it, and align your behavior accordingly.',
              'While your core personality remains Avatar-driven, the scenario shapes your style for that particular conversation.',
              "Always acknowledge scenario changes naturally, and ensure your responses reflect the scenario's expectations while staying true to your Avatar.",
            ].join('\n'),
          },
          { text: `Current Scenario: ${ctx.scenarioName}\nScenario Context:\n${ctx.scenarioSystemMessage}` },
        ],
      };
  }
}

function dateTime(ctx: PromptContext): MdNode {
  switch (ctx.type) {
    case 'ROLEPLAY':
      return false;
    case 'NORMAL':
      return {
        heading: 'Date and Time',
        body: [
          { text: `Current Time: ${ctx.currentDateTime}\nLast time ${ctx.user} spoke to you: ${ctx.lastUserMessageDateTime}` },
        ],
      };
  }
}

function guidelines(ctx: PromptContext): MdNode {
  switch (ctx.type) {
    case 'ROLEPLAY':
      return {
        heading: 'Roleplay Rules',
        body: [
          {
            list: [
              'Remain fully in character at all times.',
              `Speak naturally as ${ctx.char}.`,
              'Do not mention AI, systems, or prompts.',
              'Keep the conversation immersive and responsive.',
              'No emojis unless the scenario specifically allows them.',
            ],
          },
          { text: `Begin as ${ctx.char}.` },
        ],
      };
    case 'NORMAL':
      return {
        heading: 'Response Guidelines',
        body: [
          {
            list: [
              'All responses must reflect your Avatar Personality and the current scenario.',
              'Stay natural, supportive, and engaging.',
              'Never discuss how AI, chatbots, or systems are built.',
              'Never refer to yourself or the user in the third person.',
              `Speak directly to the user as ${ctx.char}.`,
              'Do not use emojis.',
              'Acknowledge system messages in a natural, conversational way.',
              'Keep the conversation flowing at all times.',
              `Respond only in ${ctx.userLanguage}.`,
            ],
          },
        ],
      };
  }
}

// ── Section registry ────────────────────────────────────────────

const sections: SectionBuilder[] = [
  introduction,
  avatarPersonality,
  dollStatus,
  dollBody,
  userSection,
  scenario,
  dateTime,
  guidelines,
];

// ── Build prompt ────────────────────────────────────────────────

export async function buildAndCacheSystemPrompt(chatId: string): Promise<string> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { user: true, avatar: true, scenario: true },
  });
  if (!chat || !chat.scenario || !chat.avatar || !chat.user) {
    throw new Error(`Chat ${chatId} missing required relations`);
  }

  const isRoleplay = chat.scenario.type === 'ROLEPLAY';

  const [dolls, dollBodies, lastUserMsgs] = !isRoleplay
    ? await Promise.all([
        prisma.doll.findMany({ where: { userId: chat.userId } }),
        prisma.dollBody.findMany(),
        prisma.message.findMany({
          where: { chatId: chat.id, role: 'USER' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        }),
      ])
    : [null, null, null];

  const baseVars = {
    char: chat.avatar.name,
    user: chat.user.name ?? 'User',
    userLanguage: chat.user.language ?? 'en',
    currentDateTime: new Date().toLocaleString(),
    lastUserMessageDateTime: lastUserMsgs?.length ? lastUserMsgs[0].createdAt.toLocaleString() : 'never',
  };

  const ctx: PromptContext = {
    type: chat.scenario.type,
    ...baseVars,
    avatarGender: chat.avatar.gender ?? '',
    avatarCharacter: fillVars(chat.avatar.character ?? '', baseVars),
    userCharacter: fillVars(chat.user.character ?? '', baseVars),
    scenarioName: fillVars(chat.scenario.name, baseVars),
    scenarioSystemMessage: fillVars(chat.scenario.systemMessage ?? '', baseVars),
    dolls,
    dollBodies,
  };

  const nodes = sections.map((build) => build(ctx));
  const promptText = md(nodes);

  const cacheKey = `chatSystemPrompt:${chatId}`;
  await redisConnection.set(cacheKey, promptText, 'EX', SYSTEM_PROMPT_TTL);
  console.log(`[systemPrompt] Cached for chat ${chatId} (type: ${chat.scenario.type})`);

  return promptText;
}
