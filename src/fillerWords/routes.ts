import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';
import { enqueueCreated, enqueueUpdated, enqueueDeleted } from '../queue/enqueue';

export const fillerWordsRoutes = new Elysia({ prefix: '/filler-words' })
  .use(jwtGuard)

  /* ── GET /filler-words ─────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};
    if (query.avatarId) where.avatarId = query.avatarId;

    const [items, total] = await prisma.$transaction([
      prisma.fillerWord.findMany({ skip, take, where, orderBy: { createdAt: 'asc' } }),
      prisma.fillerWord.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /filler-words/:id ─────────────────────────────────────── */
  .get('/:id', async ({ params, set }) => {
    const item = await prisma.fillerWord.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  /* ── POST /filler-words ────────────────────────────────────────── */
  .post('/', async ({ user, body, set }) => {
    const avatar = await prisma.avatar.findUnique({ where: { id: body.avatarId } });
    if (!avatar) { set.status = 404; return { error: 'Avatar not found' }; }
    if (avatar.userId !== user.userId) { set.status = 403; return { error: 'Not authorized' }; }

    const item = await prisma.fillerWord.create({
      data: {
        text: body.text,
        avatar: { connect: { id: body.avatarId } },
      },
    });
    await enqueueCreated('fillerWord', item);
    return item;
  }, {
    body: Body({
      text: t.String(),
      avatarId: t.String(),
    }),
  })

  /* ── PATCH /filler-words/:id ───────────────────────────────────── */
  .patch('/:id', async ({ user, params, body, set }) => {
    const item = await prisma.fillerWord.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    const avatar = await prisma.avatar.findUnique({ where: { id: item.avatarId } });
    if (avatar!.userId !== user.userId) { set.status = 403; return { error: 'Not authorized' }; }

    const original = item;
    const updated = await prisma.fillerWord.update({
      where: { id: params.id },
      data: { text: body.text },
    });
    await enqueueUpdated('fillerWord', updated, original);
    return updated;
  }, {
    body: Body({
      text: t.String(),
    }),
  })

  /* ── DELETE /filler-words/:id ──────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.fillerWord.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    const avatar = await prisma.avatar.findUnique({ where: { id: item.avatarId } });
    if (avatar!.userId !== user.userId) { set.status = 403; return { error: 'Not authorized' }; }

    const deleted = await prisma.fillerWord.delete({ where: { id: params.id } });
    await enqueueDeleted('fillerWord', deleted);
    return deleted;
  });
