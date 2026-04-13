import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';
import { generateEmbedding } from '../llm/embedding';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

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

const knowledgeBaseInclude = {
  scenario: true,
  _count: { select: { chunks: true } },
};

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
        include: knowledgeBaseInclude,
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
      include: { ...knowledgeBaseInclude, chunks: { orderBy: [{ fileName: 'asc' }, { chunkIndex: 'asc' }] } },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }

    const scenario = await prisma.scenario.findUnique({ where: { id: item.scenarioId } });
    if (!scenario || (scenario.userId !== user.userId && user.role !== 'ADMIN')) {
      set.status = 403; return { error: 'Not authorized' };
    }
    return item;
  })

  /* ── POST /knowledge-bases ──────────────────────────────────── */
  .post('/', async ({ user, body, set }) => {
    const scenario = await prisma.scenario.findUnique({ where: { id: body.scenarioId } });
    if (!scenario) { set.status = 404; return { error: 'Scenario not found' }; }
    if (scenario.userId !== user.userId && user.role !== 'ADMIN') {
      set.status = 403; return { error: 'Not authorized' };
    }

    // Check if scenario already has a knowledge base
    const existing = await prisma.knowledgeBase.findUnique({ where: { scenarioId: body.scenarioId } });
    if (existing) { set.status = 409; return { error: 'Scenario already has a knowledge base' }; }

    const item = await model.knowledgeBase.create({
      data: {
        name: body.name,
        scenario: { connect: { id: body.scenarioId } },
      },
      include: knowledgeBaseInclude,
    });
    return item;
  }, {
    body: Body({
      name: t.String(),
      scenarioId: t.String(),
    }),
  })

  /* ── PATCH /knowledge-bases/:id ─────────────────────────────── */
  .patch('/:id', async ({ user, params, body, set }) => {
    const item = await prisma.knowledgeBase.findUnique({ where: { id: params.id }, include: { scenario: true } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.scenario.userId !== user.userId && user.role !== 'ADMIN') {
      set.status = 403; return { error: 'Not authorized' };
    }

    const updated = await model.knowledgeBase.update({
      where: { id: params.id },
      data: { name: body.name },
      include: knowledgeBaseInclude,
    }, item);
    return updated;
  }, {
    body: Body({
      name: t.Optional(t.String()),
    }),
  })

  /* ── DELETE /knowledge-bases/:id ────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.knowledgeBase.findUnique({ where: { id: params.id }, include: { scenario: true } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.scenario.userId !== user.userId && user.role !== 'ADMIN') {
      set.status = 403; return { error: 'Not authorized' };
    }
    return model.knowledgeBase.delete({ where: { id: params.id } });
  })

  /* ── POST /knowledge-bases/:id/documents ────────────────────── */
  /* Upload a text file, chunk it, and embed each chunk */
  .post('/:id/documents', async ({ user, params, body, set }) => {
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

    const file = body.file;
    if (!file || file.size === 0) { set.status = 400; return { error: 'File is required' }; }

    const text = await file.text();
    if (!text.trim()) { set.status = 400; return { error: 'File is empty' }; }

    const fileName = file.name ?? 'unknown.txt';
    const chunks = chunkText(text);

    // Delete any existing chunks for this file name (re-upload replaces)
    await prisma.knowledgeBaseChunk.deleteMany({
      where: { knowledgeBaseId: kb.id, fileName },
    });

    // Create chunks and generate embeddings
    const embeddingModel = kb.scenario.embeddingModel;
    const createdChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i];

      let vectorSql = '';
      try {
        const result = await generateEmbedding(chunkContent, embeddingModel);
        vectorSql = `[${result.vector.join(',')}]`;
      } catch (err: any) {
        console.error(`[knowledgeBase] Embedding failed for chunk ${i} of ${fileName}: ${err.message}`);
      }

      if (vectorSql) {
        // Use raw SQL to insert with vector (Prisma doesn't support Unsupported types in create)
        const [row] = await prisma.$queryRawUnsafe<any[]>(
          `INSERT INTO "KnowledgeBaseChunk" ("id", "createdAt", "updatedAt", "content", "fileName", "chunkIndex", "vector", "knowledgeBaseId")
           VALUES (gen_random_uuid(), NOW(), NOW(), $1, $2, $3, $4::vector, $5)
           RETURNING "id", "createdAt", "updatedAt", "content", "fileName", "chunkIndex", "knowledgeBaseId"`,
          chunkContent, fileName, i, vectorSql, kb.id,
        );
        createdChunks.push(row);
      } else {
        // Fallback: create without vector
        const chunk = await prisma.knowledgeBaseChunk.create({
          data: {
            content: chunkContent,
            fileName,
            chunkIndex: i,
            knowledgeBase: { connect: { id: kb.id } },
          },
        });
        createdChunks.push(chunk);
      }
    }

    return { fileName, chunksCreated: createdChunks.length, chunks: createdChunks };
  }, {
    body: Body({
      file: t.File(),
    }),
  })

  /* ── DELETE /knowledge-bases/:id/documents/:fileName ────────── */
  .delete('/:id/documents/:fileName', async ({ user, params, set }) => {
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: params.id },
      include: { scenario: true },
    });
    if (!kb) { set.status = 404; return { error: 'Knowledge base not found' }; }
    if (kb.scenario.userId !== user.userId && user.role !== 'ADMIN') {
      set.status = 403; return { error: 'Not authorized' };
    }

    const deleted = await prisma.knowledgeBaseChunk.deleteMany({
      where: { knowledgeBaseId: kb.id, fileName: params.fileName },
    });

    if (deleted.count === 0) { set.status = 404; return { error: 'Document not found' }; }
    return { deleted: deleted.count };
  })

  /* ── POST /knowledge-bases/:id/search ───────────────────────── */
  /* Search the knowledge base for chunks similar to a query */
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
      `SELECT "id", "content", "fileName", "chunkIndex",
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
