import type { Chat, Scenario } from '@prisma/client';
import { prisma } from '../db';
import { redisConnection } from '../queue/connection';
import { getChatHistory } from './chatHistory';
import { buildAndCacheSystemPrompt } from '../chats/systemPrompt';
import { retrieveRagContext, formatRagContext } from './rag';

/**
 * Call the LLM (Ollama-compatible OpenAI endpoint) for chat completion.
 * System prompt and chat history are read from Redis for speed.
 */
export async function chatCompletion(chat: Chat & { scenario: Scenario & { chatModel: any } }): Promise<{
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}> {
  const chatModel = chat.scenario.chatModel;
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

  // RAG: retrieve relevant knowledge base context from the latest user message
  const lastUserMessage = [...history].reverse().find(m => m.role === 'user');
  if (lastUserMessage?.content) {
    try {
      const ragChunks = await retrieveRagContext(chat.scenarioId, lastUserMessage.content);
      const ragContext = formatRagContext(ragChunks);
      if (ragContext) systemPrompt += ragContext;
    } catch (err: any) {
      console.error(`[chatCompletion] RAG retrieval failed: ${err.message}`);
    }
  }

  // Build messages array: system prompt + chat history
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
      temperature: chat.scenario.temperature ?? 0,
      top_p: chat.scenario.topP ?? 1,
      frequency_penalty: chat.scenario.frequencyPenalty ?? 0,
      presence_penalty: chat.scenario.presencePenalty ?? 0,
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
