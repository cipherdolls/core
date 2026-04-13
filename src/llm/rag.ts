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
 * Search knowledge base chunks for content similar to the query.
 * Returns a formatted context string, or empty string if no results / no KB.
 */
export async function searchKnowledgeBase(
  scenarioId: string,
  query: string,
  limit = 5,
): Promise<string> {
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: { embeddingModel: true, knowledgeBase: true },
  });
  if (!scenario?.embeddingModel || !scenario.knowledgeBase) return '';

  const result = await generateEmbedding(query, scenario.embeddingModel);
  const vectorStr = `[${result.vector.join(',')}]`;

  const rows = await prisma.$queryRawUnsafe<{ content: string; fileName: string; similarity: number }[]>(
    `SELECT "content", "fileName",
            1 - ("vector" <=> $1::vector) AS similarity
     FROM "KnowledgeBaseChunk"
     WHERE "knowledgeBaseId" = $2 AND "vector" IS NOT NULL
     ORDER BY "vector" <=> $1::vector
     LIMIT $3`,
    vectorStr, scenario.knowledgeBase.id, limit,
  );

  if (rows.length === 0) return '';

  const parts = rows.map(r =>
    `[Source: ${r.fileName}]\n${r.content}`
  );

  return `### Knowledge Base\n${parts.join('\n\n')}`;
}
