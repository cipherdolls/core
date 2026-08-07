import { Elysia } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';

const jobInclude = {
  embeddingModel: { include: { aiProvider: true } },
};

export const embeddingJobsRoutes = new Elysia({ prefix: '/embedding-jobs' })
  .use(jwtGuard)

  .get('/:id', async ({ user, params, set }) => {
    const item = await prisma.embeddingJob.findUnique({
      where: { id: params.id },
      include: { ...jobInclude, message: { select: { chat: { select: { userId: true } } } } },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.message.chat.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    const { message: _message, ...job } = item;
    return job;
  });
