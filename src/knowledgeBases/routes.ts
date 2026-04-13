import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';
import { generateEmbedding } from '../llm/embedding';
import { PDFParse } from 'pdf-parse';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

const SUPPORTED_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json', 'xml', 'html', 'pdf']);

/**
 * Extract text content from a file based on its type.
 */
async function extractText(file: File): Promise<string> {
  const ext = (file.name?.split('.').pop() ?? '').toLowerCase();

  if (ext === 'pdf') {
    const data = new Uint8Array(await file.arrayBuffer());
    const parser = new PDFParse({ data });
    const result = await parser.getText();
    await parser.destroy();
    return result.text ?? '';
  }

  return await file.text();
}

/**
 * Split text into overlapping chunks for embedding.
 */
function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= text.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

export const knowledgeBasesRoutes = new Elysia({ prefix: '/knowledge-bases' })

  .use(jwtGuard)

  /* ── GET /knowledge-bases ───────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};

    if (query.scenarioId) where.scenarioId = query.scenarioId;

    // Only show knowledge bases for scenarios the user owns
    where.scenario = { userId: user.userId };

    const [items, total] = await prisma.$transaction([
      prisma.knowledgeBase.findMany({
        skip, take, where,
        include: { _count: { select: { chunks: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.knowledgeBase.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /knowledge-bases/:id ───────────────────────────────── */
  .get('/:id', async ({ user, params, set }) => {
    const item = await prisma.knowledgeBase.findUnique({
      where: { id: params.id },
      include: { scenario: true, _count: { select: { chunks: true } } },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.scenario.userId !== user.userId && user.role !== 'ADMIN') {
      set.status = 403; return { error: 'Not authorized' };
    }
    const { scenario: _, ...kb } = item;
    return kb;
  })

  /* ── POST /knowledge-bases ──────────────────────────────────── */
  /* Upload a file → creates a knowledge base with embedded chunks */
  .post('/', async ({ user, body, set }) => {
    const scenario = await prisma.scenario.findUnique({
      where: { id: body.scenarioId },
      include: { embeddingModel: true },
    });
    if (!scenario) { set.status = 404; return { error: 'Scenario not found' }; }
    if (scenario.userId !== user.userId && user.role !== 'ADMIN') {
      set.status = 403; return { error: 'Not authorized' };
    }
    if (!scenario.embeddingModel) {
      set.status = 400; return { error: 'Scenario has no embedding model configured' };
    }

    const file = body.file;
    if (!file || file.size === 0) { set.status = 400; return { error: 'File is required' }; }

    const fileName = file.name ?? 'unknown.txt';
    const ext = (fileName.split('.').pop() ?? '').toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      set.status = 400;
      return { error: `Unsupported file type: .${ext}. Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}` };
    }

    const text = await extractText(file);
    if (!text.trim()) { set.status = 400; return { error: 'Could not extract text from file' }; }

    const chunks = chunkText(text);
    const name = body.name ?? fileName;

    // Create the knowledge base
    const kb = await model.knowledgeBase.create({
      data: {
        name,
        fileName,
        fileType: ext,
        fileSize: file.size,
        scenario: { connect: { id: body.scenarioId } },
      },
    });

    // Create chunks with embeddings
    const embeddingModel = scenario.embeddingModel;
    let embedded = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i];

      let vectorSql = '';
      try {
        const result = await generateEmbedding(chunkContent, embeddingModel);
        vectorSql = `[${result.vector.join(',')}]`;
        embedded++;
      } catch (err: any) {
        console.error(`[knowledgeBase] Embedding failed for chunk ${i} of ${fileName}: ${err.message}`);
      }

      if (vectorSql) {
        await prisma.$queryRawUnsafe(
          `INSERT INTO "KnowledgeBaseChunk" ("id", "createdAt", "updatedAt", "content", "chunkIndex", "vector", "knowledgeBaseId")
           VALUES (gen_random_uuid(), NOW(), NOW(), $1, $2, $3::vector, $4)`,
          chunkContent, i, vectorSql, kb.id,
        );
      } else {
        await prisma.knowledgeBaseChunk.create({
          data: {
            content: chunkContent,
            chunkIndex: i,
            knowledgeBase: { connect: { id: kb.id } },
          },
        });
      }
    }

    console.log(`[knowledgeBase] Created "${name}" (${chunks.length} chunks, ${embedded} embedded)`);

    return {
      ...kb,
      chunksCreated: chunks.length,
      chunksEmbedded: embedded,
    };
  }, {
    body: Body({
      scenarioId: t.String(),
      file: t.File(),
      name: t.Optional(t.String()),
    }),
  })

  /* ── DELETE /knowledge-bases/:id ────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.knowledgeBase.findUnique({
      where: { id: params.id },
      include: { scenario: true },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.scenario.userId !== user.userId && user.role !== 'ADMIN') {
      set.status = 403; return { error: 'Not authorized' };
    }
    return model.knowledgeBase.delete({ where: { id: params.id } });
  })

  /* ── POST /knowledge-bases/:id/search ───────────────────────── */
  .post('/:id/search', async ({ user, params, body, set }) => {
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: params.id },
      include: { scenario: { include: { embeddingModel: true } } },
    });
    if (!kb) { set.status = 404; return { error: 'Knowledge base not found' }; }
    if (kb.scenario.userId !== user.userId && user.role !== 'ADMIN') {
      set.status = 403; return { error: 'Not authorized' };
    }
    if (!kb.scenario.embeddingModel) {
      set.status = 400; return { error: 'Scenario has no embedding model configured' };
    }

    const embeddingResult = await generateEmbedding(body.query, kb.scenario.embeddingModel);
    const vectorStr = `[${embeddingResult.vector.join(',')}]`;
    const limit = body.limit ?? 5;

    const results = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id", "content", "chunkIndex",
              1 - ("vector" <=> $1::vector) AS similarity
       FROM "KnowledgeBaseChunk"
       WHERE "knowledgeBaseId" = $2 AND "vector" IS NOT NULL
       ORDER BY "vector" <=> $1::vector
       LIMIT $3`,
      vectorStr, kb.id, limit,
    );

    return { data: results };
  }, {
    body: Body({
      query: t.String(),
      limit: t.Optional(t.Number()),
    }),
  });
