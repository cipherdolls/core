import { prisma } from '../db';
import { generateEmbedding } from './embedding';

/**
 * Search past messages in a chat for ones similar to the query.
 * Returns a formatted context string, or empty string if no results.
 */
export async function searchMessages(
  chatId: string,
  scenarioId: string,
  query: string,
  limit = 5,
): Promise<string> {
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: { embeddingModel: true },
  });
  if (!scenario?.embeddingModel) return '';

  const result = await generateEmbedding(query, scenario.embeddingModel);
  const vectorStr = `[${result.vector.join(',')}]`;

  const rows = await prisma.$queryRawUnsafe<{ role: string; content: string; similarity: number }[]>(
    `SELECT "role", "content",
            1 - ("vector" <=> $1::vector) AS similarity
     FROM "Message"
     WHERE "chatId" = $2 AND "vector" IS NOT NULL
     ORDER BY "vector" <=> $1::vector
     LIMIT $3`,
    vectorStr, chatId, limit,
  );

  if (rows.length === 0) return '';

  const parts = rows.map(r =>
    `[${r.role}] ${r.content}`
  );

  return `### Relevant Past Messages\n${parts.join('\n\n')}`;
}

/**
 * Search across ALL knowledge bases for a scenario.
 * Returns a formatted context string, or empty string if no results / no KBs.
 */
export async function searchKnowledgeBase(
  scenarioId: string,
  query: string,
  limit = 5,
): Promise<string> {
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: { embeddingModel: true, knowledgeBases: { select: { id: true, name: true } } },
  });
  if (!scenario?.embeddingModel || scenario.knowledgeBases.length === 0) return '';

  const result = await generateEmbedding(query, scenario.embeddingModel);
  const vectorStr = `[${result.vector.join(',')}]`;

  const kbIds = scenario.knowledgeBases.map(kb => kb.id);
  const kbNameMap = new Map(scenario.knowledgeBases.map(kb => [kb.id, kb.name]));

  // Build placeholders for the IN clause: $2, $3, $4, ...
  const placeholders = kbIds.map((_, i) => `$${i + 2}`).join(', ');

  const rows = await prisma.$queryRawUnsafe<{ content: string; knowledgeBaseId: string; similarity: number }[]>(
    `SELECT "content", "knowledgeBaseId",
            1 - ("vector" <=> $1::vector) AS similarity
     FROM "KnowledgeBaseChunk"
     WHERE "knowledgeBaseId" IN (${placeholders}) AND "vector" IS NOT NULL
     ORDER BY "vector" <=> $1::vector
     LIMIT $${kbIds.length + 2}`,
    vectorStr, ...kbIds, limit,
  );

  if (rows.length === 0) return '';

  const parts = rows.map(r =>
    `[Source: ${kbNameMap.get(r.knowledgeBaseId) ?? 'unknown'}]\n${r.content}`
  );

  return `### Knowledge Base\n${parts.join('\n\n')}`;
}
