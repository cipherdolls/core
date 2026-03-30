import { Elysia } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';

const jobInclude = {
  embeddingModel: { include: { aiProvider: true } },
};

export const embeddingJobsRoutes = new Elysia({ prefix: '/embedding-jobs' })
  .use(jwtGuard)

  .get('/:id', async ({ params, set }) => {
    const item = await prisma.embeddingJob.findUnique({
      where: { id: params.id },
      include: jobInclude,
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  });
