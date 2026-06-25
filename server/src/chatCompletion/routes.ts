import { Elysia } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';

const include = {
  chatModel: { include: { aiProvider: true } },
};

export const chatCompletionRoutes = new Elysia({ prefix: '/chat-completions' })
  .use(jwtGuard)

  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};
    if (query.chatId) where.chatId = query.chatId;

    const [items, total] = await prisma.$transaction([
      prisma.chatCompletion.findMany({ skip, take, where, include, orderBy: { createdAt: 'desc' } }),
      prisma.chatCompletion.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  .get('/:id', async ({ params, set }) => {
    const item = await prisma.chatCompletion.findUnique({ where: { id: params.id }, include });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  });
