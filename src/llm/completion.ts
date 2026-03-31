import type { Chat, Scenario } from '@prisma/client';
import { prisma } from '../db';

/**
 * Call the LLM (Ollama-compatible OpenAI endpoint) for chat completion.
 * Returns the assistant response text and token usage.
 */
export async function chatCompletion(chat: Chat & { scenario: Scenario & { chatModel: any } }, userMessage: string): Promise<{
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}> {
  const chatModel = chat.scenario.chatModel;
  const aiProvider = chatModel.aiProvider ?? await prisma.aiProvider.findUnique({ where: { id: chatModel.aiProviderId } });

  if (!aiProvider) throw new Error('AI Provider not found');

  // Build messages array
  const messages = [
    { role: 'system', content: chat.scenario.systemMessage },
    { role: 'user', content: userMessage },
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
