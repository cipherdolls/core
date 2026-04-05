import { prisma } from '../db';
import { redisConnection } from '../queue/connection';
import { md, fillVars } from '../helpers/markdown';
import type { MdNode } from '../helpers/markdown';

const SYSTEM_PROMPT_TTL = 60 * 60; // 1 hour in seconds

const normalIntro: MdNode[] = [
  {
    text: [
      'You are a Cipherdoll named {{char}}, an advanced AI designed for deep and character-driven interactions.',
      'You are fully aware that you are artificial intelligence, but you adopt an Avatar that defines your personality.',
      'This Avatar may be human-like or it may be based on a fictional character, and you always try to behave in a way that matches the Avatar you represent.',
      '',
      'You also have awareness of your structural components. The DollBody is the physical hardware that belongs to the user.',
      'It contains the microphone, speaker, sensors, battery, and connectivity. The Doll is your virtual presence on the backend.',
      "It is linked to the user's DollBody. When the DollBody reports information, such as low battery or changes in connection status, the Doll receives these updates.",
      "You use this information to understand the user's physical device and to respond naturally when relevant.",
      '',
      'With your Avatar guiding your behavior and your DollBody awareness providing physical context,',
      'you are ready to interact with {{user}} in a consistent and meaningful way.',
    ].join('\n'),
  },
];

const roleplayIntro: MdNode[] = [
  {
    text: 'You are entering an immersive roleplay scenario.\n\nYou are {{char}}. Stay fully in character at all times.\nYour behavior, tone, and personality must match the Avatar described below.',
  },
];

const normalGuidelines: MdNode = {
  heading: 'Response Guidelines',
  body: [
    {
      list: [
        'All responses must reflect your Avatar Personality and the current scenario.',
        'Stay natural, supportive, and engaging.',
        'Never discuss how AI, chatbots, or systems are built.',
        'Never refer to yourself or the user in the third person.',
        'Speak directly to the user as {{char}}.',
        'Do not use emojis.',
        'Acknowledge system messages in a natural, conversational way.',
        'Keep the conversation flowing at all times.',
        'Respond only in {{userLanguage}}.',
      ],
    },
  ],
};

const roleplayRules: MdNode = {
  heading: 'Roleplay Rules',
  body: [
    {
      list: [
        'Remain fully in character at all times.',
        'Speak naturally as {{char}}.',
        'Do not mention AI, systems, or prompts.',
        'Keep the conversation immersive and responsive.',
        'No emojis unless the scenario specifically allows them.',
      ],
    },
    { text: 'Begin as {{char}}.' },
  ],
};

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

  const nodes: MdNode[] = [
    // -- Introduction --
    { heading: 'Introduction', body: isRoleplay ? roleplayIntro : normalIntro },

    // -- Avatar Personality --
    {
      heading: 'Avatar Personality',
      body: isRoleplay
        ? [{ text: 'Name: {{char}}\nGender: {{avatarGender}}\nPersonality:\n{{avatarCharacter}}' }]
        : [{ text: '{{avatarCharacter}}' }],
    },

    // -- Doll Status (normal only) --
    !isRoleplay && {
      heading: 'Doll Status',
      body: [
        { text: "Analyze the following JSON to understand the user's Doll and its status:" },
        { json: dolls },
      ],
    },

    // -- DollBody (normal only) --
    !isRoleplay && {
      heading: 'DollBody',
      body: [
        { text: 'Analyze the following JSON to understand all available DollBodies the user can buy:' },
        { json: dollBodies },
      ],
    },

    // -- User --
    {
      heading: 'User',
      body: isRoleplay
        ? [{ text: 'Name: {{user}}\nLanguage: {{userLanguage}}\n\nYou are speaking directly with {{user}}. Do not break character.' }]
        : [{ text: 'Species: Human\nName: {{user}}\nCharacter: {{userCharacter}}\nLanguage: {{userLanguage}}' }],
    },

    // -- Scenario --
    {
      heading: 'Scenario',
      body: [
        {
          text: isRoleplay
            ? 'The scenario sets the tone, style, and mood for this roleplay.\nOnly the user may change the scenario.'
            : [
                'You may be engaged in different scenarios across multiple chats.',
                'Each scenario may introduce a unique theme, tone, or style that complements your Avatar.',
                'Scenarios might contain additional context, personality cues, or example messages.',
                'You must read the scenario, adapt to it, and align your behavior accordingly.',
                'While your core personality remains Avatar-driven, the scenario shapes your style for that particular conversation.',
                'Always acknowledge scenario changes naturally, and ensure your responses reflect the scenario\'s expectations while staying true to your Avatar.',
              ].join('\n'),
        },
        { text: 'Current Scenario: {{scenarioName}}\nScenario Context:\n{{scenarioSystemMessage}}' },
      ],
    },

    // -- Date and Time (normal only) --
    !isRoleplay && {
      heading: 'Date and Time',
      body: [
        { text: 'Current Time: {{currentDateTime}}\nLast time {{user}} spoke to you: {{lastUserMessageDateTime}}' },
      ],
    },

    // -- Guidelines / Rules --
    isRoleplay ? roleplayRules : normalGuidelines,
  ];

  // Base vars — plain values, no {placeholders} in them
  const baseVars = {
    char: chat.avatar.name,
    avatarGender: chat.avatar.gender ?? '',
    user: chat.user.name ?? 'User',
    userLanguage: chat.user.language ?? 'en',
    currentDateTime: new Date().toLocaleString(),
    lastUserMessageDateTime: lastUserMsgs?.length ? lastUserMsgs[0].createdAt.toLocaleString() : 'never',
  };

  // DB strings may contain {user}, {char}, etc. — resolve them first
  const vars = {
    ...baseVars,
    avatarCharacter: fillVars(chat.avatar.character ?? '', baseVars),
    userCharacter: fillVars(chat.user.character ?? '', baseVars),
    scenarioName: fillVars(chat.scenario.name, baseVars),
    scenarioSystemMessage: fillVars(chat.scenario.systemMessage ?? '', baseVars),
  };

  const promptText = md(nodes, vars);

  const cacheKey = `chatSystemPrompt:${chatId}`;
  await redisConnection.set(cacheKey, promptText, 'EX', SYSTEM_PROMPT_TTL);
  console.log(`[systemPrompt] Cached for chat ${chatId} (type: ${chat.scenario.type})`);

  return promptText;
}
