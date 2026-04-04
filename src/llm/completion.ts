import type { Chat, Scenario } from '@prisma/client';
import { prisma } from '../db';
import { redisConnection } from '../queue/connection';
import { getChatHistory, type ChatMessage } from './chatHistory';
import { buildAndCacheSystemPrompt } from '../chats/systemPrompt';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResult {
  content: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Call the LLM (Ollama-compatible OpenAI endpoint) for chat completion.
 * System prompt and chat history are read from Redis for speed.
 * Optionally accepts tools for function calling and extra messages (for tool results).
 */
export async function chatCompletion(
  chat: Chat & { scenario: Scenario & { chatModel: any } },
  options?: { tools?: any[]; extraMessages?: ChatMessage[] },
): Promise<ChatCompletionResult> {
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

  // Build messages array: system prompt + chat history + extra messages (tool results)
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    ...(options?.extraMessages ?? []),
  ];

  const body: Record<string, any> = {
    model: chatModel.providerModelName,
    messages,
    temperature: chat.scenario.temperature ?? 0,
    top_p: chat.scenario.topP ?? 1,
    frequency_penalty: chat.scenario.frequencyPenalty ?? 0,
    presence_penalty: chat.scenario.presencePenalty ?? 0,
  };

  if (options?.tools?.length) {
    body.tools = options.tools;
  }

  const response = await fetch(`${aiProvider.basePath}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiProvider.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM error (${response.status}) from ${aiProvider.name} (${aiProvider.basePath}), model ${chatModel.providerModelName}: ${error}`);
  }

  const data = await response.json() as any;
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? '';
  const toolCalls: ToolCall[] = choice?.message?.tool_calls ?? [];
  const usage = data.usage ?? {};

  return {
    content: content.trim(),
    toolCalls,
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}
