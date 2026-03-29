import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { enqueueCreated, enqueueDeleted } from '../queue/enqueue';

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
      include: { chat: true, chatCompletionJob: true, ttsJob: true, embeddingJob: true },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    // No ownership check on findOne — matches backend behavior
    const { chat: _, ...message } = item;
    return message;
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

    if (body.fileName) {
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
