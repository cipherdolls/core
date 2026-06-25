import type { Message } from '@prisma/client';
import { redisConnection } from '../queue/connection';
import { prisma } from '../db';

const MAX_HISTORY_MESSAGES = 50;
const CHAT_HISTORY_TTL = 60 * 60; // 1 hour in seconds

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function cacheKey(chatId: string): string {
  return `chatHistory:${chatId}`;
}

function mapRole(role: string): ChatMessage['role'] {
  switch (role) {
    case 'USER': return 'user';
    case 'ASSISTANT': return 'assistant';
    default: return 'system';
  }
}

/**
 * Append a message to the Redis chat history list.
 */
export async function appendChatHistory(message: Message): Promise<void> {
  const key = cacheKey(message.chatId);

  const entry: ChatMessage = {
    role: mapRole(message.role),
    content: message.content ?? '',
  };

  await redisConnection.rpush(key, JSON.stringify(entry));

  const len = await redisConnection.llen(key);
  if (len > MAX_HISTORY_MESSAGES) {
    await redisConnection.ltrim(key, len - MAX_HISTORY_MESSAGES, -1);
  }

  await redisConnection.expire(key, CHAT_HISTORY_TTL);
}

/**
 * Get chat history from Redis. If empty, build from DB once.
 * Never rebuilds if cache already has entries.
 */
export async function getChatHistory(chatId: string): Promise<ChatMessage[]> {
  const key = cacheKey(chatId);

  const cached = await redisConnection.lrange(key, 0, -1);
  if (cached.length > 0) {
    return cached.map((s) => JSON.parse(s) as ChatMessage);
  }

  // Empty cache — build from DB
  return buildFromDb(chatId);
}

/**
 * Rebuild the chat history cache from DB.
 * Call after chat completion to ensure cache is in sync.
 */
export async function rebuildChatHistory(chatId: string): Promise<void> {
  await buildFromDb(chatId);
}

/**
 * Invalidate the chat history cache (e.g. on message delete).
 */
export async function invalidateChatHistory(chatId: string): Promise<void> {
  await redisConnection.del(cacheKey(chatId));
}

async function buildFromDb(chatId: string): Promise<ChatMessage[]> {
  const key = cacheKey(chatId);

  const dbMessages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'desc' },
    take: MAX_HISTORY_MESSAGES,
  });

  const history: ChatMessage[] = dbMessages.reverse().map((m) => ({
    role: mapRole(m.role),
    content: m.content ?? '',
  }));

  if (history.length > 0) {
    const pipeline = redisConnection.pipeline();
    pipeline.del(key);
    for (const entry of history) {
      pipeline.rpush(key, JSON.stringify(entry));
    }
    pipeline.expire(key, CHAT_HISTORY_TTL);
    await pipeline.exec();
  }

  return history;
}
