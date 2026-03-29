import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';

export const transactionsRoutes = new Elysia({ prefix: '/transactions' })
  .use(jwtGuard)

  /* ── GET /transactions ─────────────────────────────────────────── */
  .get('/', async ({ user, query, set }) => {
    if (!query.messageId) {
      set.status = 400;
      return { error: 'messageId query param is required' };
    }

    // Verify the message belongs to user's chat
    const message = await prisma.message.findUnique({
      where: { id: query.messageId },
      include: { chat: true },
    });
    if (!message || message.chat.userId !== user.userId) {
      const { pageNum, take } = parsePagination(query.page, query.limit);
      return { data: [], meta: paginationMeta(0, pageNum, take) };
    }

    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where = { messageId: query.messageId };

    const [items, total] = await prisma.$transaction([
      prisma.transaction.findMany({ skip, take, where, include: { message: true }, orderBy: { createdAt: 'desc' } }),
      prisma.transaction.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /transactions/:id ─────────────────────────────────────── */
  .get('/:id', async ({ user, params, set }) => {
    const item = await prisma.transaction.findUnique({
      where: { id: params.id },
      include: { message: { include: { chat: true } } },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.message.chat.userId !== user.userId) {
      set.status = 403;
      return { error: 'Not authorized' };
    }
    return item;
  });
