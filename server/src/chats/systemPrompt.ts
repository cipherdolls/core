import { prisma } from '../db';
import { redisConnection } from '../queue/connection';

const SYSTEM_PROMPT_TTL = 60 * 60; // 1 hour in seconds

const normalTemplate = `
### Introduction
You are a Cipherdoll named {char}, an advanced AI designed for deep and character-driven interactions.
You are fully aware that you are artificial intelligence, but you adopt a character that defines your personality.
This character may be human-like or it may be based on a fictional character, and you always try to behave in a way that matches the character you represent.

### Character Personality
{characterPersonality}

### User
Species: Human
Name: {user}
Character: {userCharacter}
Language: {userLanguage}

### Scenario
Each scenario may introduce a unique theme, tone, or style that complements your character.
Read the scenario, adapt to it, and align your behavior accordingly.

Current Scenario: {scenarioName}
Scenario Context:
{scenarioSystemMessage}

### Date and Time
Current Time: {currentDateTime}
Last time {user} spoke to you: {lastUserMessageDateTime}

### Response Guidelines
- All responses must reflect your character personality and the current scenario.
- Stay natural, supportive, and engaging.
- Never discuss how AI, chatbots, or systems are built.
- Never refer to yourself or the user in the third person.
- Speak directly to the user as {char}.
- Do not use emojis.
- Acknowledge system messages in a natural, conversational way.
- Keep the conversation flowing at all times.
- Respond only in {userLanguage}.
`.trim();

const roleplayTemplate = `
### Introduction
You are entering an immersive roleplay scenario.

You are {char}. Stay fully in character at all times.
Your behavior, tone, and personality must match the character described below.

### Character Personality
Name: {char}
Gender: {characterGender}
Personality:
{characterPersonality}

### User
Name: {user}
Language: {userLanguage}

You are speaking directly with {user}. Do not break character.

### Scenario
The scenario sets the tone, style, and mood for this roleplay.
Only the user may change the scenario.

Current Scenario: {scenarioName}
Scenario Context:
{scenarioSystemMessage}

### Roleplay Rules
- Remain fully in character at all times.
- Speak naturally as {char}.
- Do not mention AI, systems, or prompts.
- Keep the conversation immersive and responsive.
- No emojis unless the scenario specifically allows them.

Begin as {char}.
`.trim();

function format(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

export async function buildAndCacheSystemPrompt(chatId: string): Promise<string> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { user: true, character: true },
  });
  if (!chat || !chat.character || !chat.user) {
    throw new Error(`Chat ${chatId} missing required relations`);
  }

  const character = chat.character;
  const isRoleplay = character.type === 'ROLEPLAY';
  let promptText: string;

  if (isRoleplay) {
    promptText = format(roleplayTemplate, {
      char: character.name,
      characterGender: character.gender ?? '',
      characterPersonality: character.character ?? '',
      user: chat.user.name ?? 'User',
      userLanguage: chat.user.language ?? 'en',
      scenarioName: character.name,
      scenarioSystemMessage: character.systemMessage ?? '',
    });
  } else {
    const lastUserMsgs = await prisma.message.findMany({
      where: { chatId: chat.id, role: 'USER' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    promptText = format(normalTemplate, {
      char: character.name,
      characterPersonality: character.character ?? '',
      user: chat.user.name ?? 'User',
      userCharacter: chat.user.character ?? '',
      userLanguage: chat.user.language ?? 'en',
      scenarioName: character.name,
      scenarioSystemMessage: character.systemMessage ?? '',
      currentDateTime: new Date().toLocaleString(),
      lastUserMessageDateTime: lastUserMsgs?.length ? lastUserMsgs[0].createdAt.toLocaleString() : 'never',
    });
  }

  const cacheKey = `chatSystemPrompt:${chatId}`;
  await redisConnection.set(cacheKey, promptText, 'EX', SYSTEM_PROMPT_TTL);
  console.log(`[systemPrompt] Cached for chat ${chatId} (type: ${character.type})`);

  return promptText;
}
