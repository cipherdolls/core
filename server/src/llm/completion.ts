import type { Chat, Character } from '@prisma/client';
import { prisma } from '../db';
import { redisConnection } from '../queue/connection';
import { getChatHistory } from './chatHistory';
import { buildAndCacheSystemPrompt } from '../chats/systemPrompt';

/**
 * Call the LLM (OpenAI-compatible endpoint) for chat completion.
 * System prompt and chat history are read from Redis for speed.
 */
export async function chatCompletion(chat: Chat & { character: Character & { chatModel: any } }): Promise<{
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}> {
  const chatModel = chat.character.chatModel;
  const aiProvider = chatModel.aiProvider ?? await prisma.aiProvider.findUnique({ where: { id: chatModel.aiProviderId } });

  if (!aiProvider) throw new Error('AI Provider not found');

  // Get system prompt from Redis (rebuild if missing)
  const cacheKey = `chatSystemPrompt:${chat.id}`;
  let systemPrompt = await redisConnection.get(cacheKey);
  if (!systemPrompt) {
    systemPrompt = await buildAndCacheSystemPrompt(chat.id);
  }

  // Get chat history from Redis (rebuild from DB if missing)
  const history = await getChatHistory(chat.id);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  const response = await fetch(`${aiProvider.basePath}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiProvider.apiKey}`,
    },
    body: JSON.stringify({
      model: chatModel.providerModelName,
      messages,
      temperature: chat.character.temperature ?? 0,
      top_p: chat.character.topP ?? 1,
      frequency_penalty: chat.character.frequencyPenalty ?? 0,
      presence_penalty: chat.character.presencePenalty ?? 0,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM error (${response.status}) from ${aiProvider.name} (${aiProvider.basePath}), model ${chatModel.providerModelName}: ${error}`);
  }

  const data = await response.json() as any;
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? '';
  const usage = data.usage ?? {};

  return {
    content: content.trim(),
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}
