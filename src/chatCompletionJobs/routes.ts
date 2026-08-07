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
    // Scope to the caller's own chats — otherwise any authenticated user could
    // enumerate every chat's completion jobs.
    const where: any = user.role === 'ADMIN' ? {} : { chat: { userId: user.userId } };
    if (query.chatId) where.chatId = query.chatId;

    const [items, total] = await prisma.$transaction([
      prisma.chatCompletionJob.findMany({ skip, take, where, include: jobInclude, orderBy: { createdAt: 'desc' } }),
      prisma.chatCompletionJob.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  .get('/:id', async ({ user, params, set }) => {
    const item = await prisma.chatCompletionJob.findUnique({
      where: { id: params.id },
      include: { ...jobInclude, chat: { select: { userId: true } } },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.chat.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    const { chat: _chat, ...job } = item;
    return job;
  });
