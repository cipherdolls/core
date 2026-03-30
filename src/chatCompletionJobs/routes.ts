import { Elysia } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';

const jobInclude = {
  chatModel: { include: { aiProvider: true } },
};

export const chatCompletionJobsRoutes = new Elysia({ prefix: '/chat-completion-jobs' })
  .use(jwtGuard)

  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};
    if (query.chatId) where.chatId = query.chatId;

    const [items, total] = await prisma.$transaction([
      prisma.chatCompletionJob.findMany({ skip, take, where, include: jobInclude, orderBy: { createdAt: 'desc' } }),
      prisma.chatCompletionJob.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  .get('/:id', async ({ params, set }) => {
    const item = await prisma.chatCompletionJob.findUnique({
      where: { id: params.id },
      include: jobInclude,
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  });
