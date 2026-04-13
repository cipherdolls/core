import { prisma } from '../db';
import { generateEmbedding } from './embedding';

export interface RagChunk {
  content: string;
  fileName: string;
  similarity: number;
}

/**
 * Retrieve the most relevant knowledge base chunks for a given query.
 * Returns empty array if the scenario has no knowledge base or no embedding model.
 */
export async function retrieveRagContext(
  scenarioId: string,
  query: string,
  limit = 3,
): Promise<RagChunk[]> {
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: { embeddingModel: true, knowledgeBase: true },
  });

  if (!scenario?.embeddingModel || !scenario.knowledgeBase) return [];

  let embeddingResult;
  try {
    embeddingResult = await generateEmbedding(query, scenario.embeddingModel);
  } catch (err: any) {
    console.error(`[rag] Embedding generation failed: ${err.message}`);
    return [];
  }

  const vectorStr = `[${embeddingResult.vector.join(',')}]`;

  const results = await prisma.$queryRawUnsafe<RagChunk[]>(
    `SELECT "content", "fileName",
            1 - ("vector" <=> $1::vector) AS similarity
     FROM "KnowledgeBaseChunk"
     WHERE "knowledgeBaseId" = $2 AND "vector" IS NOT NULL
     ORDER BY "vector" <=> $1::vector
     LIMIT $3`,
    vectorStr, scenario.knowledgeBase.id, limit,
  );

  return results;
}

/**
 * Format RAG chunks into a context string for injection into the system prompt.
 */
export function formatRagContext(chunks: RagChunk[]): string {
  if (chunks.length === 0) return '';

  const contextParts = chunks.map((chunk, i) =>
    `[Source: ${chunk.fileName}]\n${chunk.content}`
  );

  return `\n### Knowledge Base Context\nThe following information was retrieved from the scenario's knowledge base. Use it to inform your responses when relevant:\n\n${contextParts.join('\n\n')}`;
}
