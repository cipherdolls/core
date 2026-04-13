import { prisma } from '../db';

export interface EmbeddingResult {
  vector: number[];
  inputTokens: number;
  totalTokens: number;
}

/**
 * Generate an embedding vector via an OpenAI-compatible embeddings API.
 */
export async function generateEmbedding(
  text: string,
  embeddingModel: { providerModelName: string; aiProviderId: string },
): Promise<EmbeddingResult> {
  const aiProvider = await prisma.aiProvider.findUnique({ where: { id: embeddingModel.aiProviderId } });
  if (!aiProvider) throw new Error('AI Provider not found for embedding model');

  const response = await fetch(`${aiProvider.basePath}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiProvider.apiKey}`,
    },
    body: JSON.stringify({
      model: embeddingModel.providerModelName,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding error (${response.status}) from ${aiProvider.name}: ${error}`);
  }

  const data = await response.json() as any;
  const embedding = data.data?.[0]?.embedding;
  if (!embedding) throw new Error('No embedding returned from API');

  return {
    vector: embedding,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
  };
}
