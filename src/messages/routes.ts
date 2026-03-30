import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { enqueueCreated, enqueueDeleted } from '../queue/enqueue';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';
const MESSAGES_DIR = path.join(ASSETS_PATH, 'messages');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export const messagesRoutes = new Elysia({ prefix: '/messages' })

  .use(jwtGuard)

  /* ── GET /messages ───────────────────────────────────────────── */
  .get('/', async ({ user, query, set }) => {
    if (!query.chatId) { set.status = 400; return { error: 'chatId query param is required' }; }

    const chat = await prisma.chat.findUnique({ where: { id: query.chatId } });
    if (!chat || (chat.userId !== user.userId && user.role !== 'ADMIN')) {
      return { data: [], meta: { hasMore: false, prevCursor: null, nextCursor: null, total: 0, limit: 10 } };
    }

    const limit = Math.min(Math.max(1, parseInt(query.limit ?? '10')), 100);
    const direction = query.direction ?? 'next';
    const order = query.order === 'asc' ? 'asc' : 'desc';

    const cursorClause = query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {};
    const orderBy = { createdAt: order as 'asc' | 'desc' };

    const items = await prisma.message.findMany({
      where: { chatId: query.chatId },
      take: direction === 'prev' ? -(limit + 1) : limit + 1,
      ...cursorClause,
      orderBy,
    });

    const hasMore = items.length > limit;
    if (hasMore) {
      if (direction === 'prev') items.shift();
      else items.pop();
    }

    const total = await prisma.message.count({ where: { chatId: query.chatId } });

    return {
      data: items,
      meta: {
        hasMore,
        prevCursor: query.cursor ? items[0]?.id ?? null : null,
        nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
        total,
        limit,
      },
    };
  })

  /* ── GET /messages/:id ───────────────────────────────────────── */
  .get('/:id', async ({ user, params, set }) => {
    const item = await prisma.message.findUnique({
      where: { id: params.id },
      include: {
        chat: true,
        chatCompletionJob: { include: { chatModel: { include: { aiProvider: true } } } },
        ttsJob: { include: { ttsVoice: { include: { ttsProvider: true } } } },
        sttJob: { include: { sttProvider: true } },
        embeddingJob: { include: { embeddingModel: { include: { aiProvider: true } } } },
      },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.chat.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    const { chat: _, ...message } = item;
    return message;
  })

  /* ── GET /messages/:id/audio ─────────────────────────────────── */
  .get('/:id/audio', async ({ user, params, set }) => {
    const item = await prisma.message.findUnique({ where: { id: params.id }, include: { chat: true } });
    if (!item || !item.fileName) { set.status = 404; return { error: 'Audio not found' }; }
    if (item.chat.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }

    const filePath = path.join(MESSAGES_DIR, item.fileName);
    if (!fs.existsSync(filePath)) { set.status = 404; return { error: 'Audio file not found' }; }

    const fileBuffer = fs.readFileSync(filePath);
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'attachment; filename=audio.mp3',
      },
    });
  })

  /* ── POST /messages ──────────────────────────────────────────── */
  .post('/', async ({ user, body, set }) => {
    const chat = await prisma.chat.findUnique({ where: { id: body.chatId } });
    if (!chat) { set.status = 404; return { error: 'Chat not found' }; }
    if (chat.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }

    const data: any = {
      chat: { connect: { id: body.chatId } },
      user: { connect: { id: user.userId } },
    };

    if (body.content) data.content = body.content;

    // Handle file upload
    if (body.file && body.file.size > 0) {
      ensureDir(MESSAGES_DIR);
      const randomName = crypto.randomBytes(16).toString('hex');
      const ext = body.file.name?.split('.').pop() ?? 'mp3';
      const fileName = `${randomName}.${ext}`;
      const buffer = Buffer.from(await body.file.arrayBuffer());
      fs.writeFileSync(path.join(MESSAGES_DIR, fileName), buffer);
      data.fileName = fileName;
    } else if (body.fileName) {
      data.fileName = body.fileName;
    }

    const message = await prisma.message.create({ data });
    await enqueueCreated('message', message);
    return message;
  }, {
    body: Body({
      chatId: t.String(),
      content: t.Optional(t.String()),
      fileName: t.Optional(t.String()),
      file: t.Optional(t.File()),
    }),
  })

  /* ── PATCH /messages/:id ─────────────────────────────────────── */
  .patch('/:id', async ({ user, params, body, set }) => {
    const item = await prisma.message.findUnique({ where: { id: params.id }, include: { chat: true } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.chat.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }

    return prisma.message.update({ where: { id: params.id }, data: { content: body.content } });
  }, {
    body: Body({
      content: t.Optional(t.String()),
    }),
  })

  /* ── DELETE /messages/:id ────────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.message.findUnique({ where: { id: params.id }, include: { chat: true } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.chat.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }

    await enqueueDeleted('message', item);
    return prisma.message.delete({ where: { id: params.id } });
  });
