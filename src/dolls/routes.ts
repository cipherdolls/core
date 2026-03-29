import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';
import { enqueueCreated, enqueueUpdated, enqueueDeleted } from '../queue/enqueue';

export const dollsRoutes = new Elysia({ prefix: '/dolls' })
  .use(jwtGuard)

  /* ── GET /dolls ────────────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where = { userId: user.userId };

    const [items, total] = await prisma.$transaction([
      prisma.doll.findMany({ skip, take, where, include: { dollBody: true, chat: true }, orderBy: { createdAt: 'desc' } }),
      prisma.doll.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /dolls/:id ────────────────────────────────────────────── */
  .get('/:id', async ({ user, params, set }) => {
    const item = await prisma.doll.findUnique({
      where: { id: params.id },
      include: { dollBody: true, chat: true },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') {
      set.status = 403;
      return { error: 'Not authorized' };
    }
    return item;
  })

  /* ── POST /dolls ───────────────────────────────────────────────── */
  .post(
    '/',
    async ({ user, body, set }) => {
      // Check if a doll with same macAddress already exists
      const existing = await prisma.doll.findFirst({ where: { macAddress: body.macAddress } });

      if (existing) {
        // Same user — return existing
        if (existing.userId === user.userId) return existing;

        // Different user — reassign to current user
        const original = existing;
        const reassigned = await prisma.doll.update({
          where: { id: existing.id },
          data: { user: { connect: { id: user.userId } } },
        });
        await enqueueUpdated('doll', reassigned, original);
        return reassigned;
      }

      // Verify dollBody exists
      const dollBody = await prisma.dollBody.findUnique({ where: { id: body.dollBodyId } });
      if (!dollBody) {
        set.status = 404;
        return { error: 'DollBody not found' };
      }

      // Auto-assign a chat if no chatId provided
      let chatId = body.chatId;
      if (!chatId) {
        // Look for an existing doll with the same dollBody owned by this user that has a chat
        const siblingDoll = await prisma.doll.findFirst({
          where: { dollBodyId: body.dollBodyId, userId: user.userId, chatId: { not: null } },
        });

        if (siblingDoll && siblingDoll.chatId) {
          // Take over the chat from the sibling doll
          chatId = siblingDoll.chatId;
          await prisma.doll.update({
            where: { id: siblingDoll.id },
            data: { chat: { disconnect: true } },
          });
        } else {
          // No sibling — find an existing chat with same avatar, or create one
          const existingChat = await prisma.chat.findFirst({
            where: { userId: user.userId, avatarId: dollBody.avatarId, doll: { is: null } },
          });

          if (existingChat) {
            chatId = existingChat.id;
          } else {
            // Create a new chat
            const scenario = await prisma.scenario.findFirst({
              where: { OR: [{ recommended: true, published: true }, { published: true }] },
              orderBy: [{ recommended: 'desc' }, { createdAt: 'asc' }],
            });
            if (scenario) {
              const chat = await prisma.chat.create({
                data: {
                  user: { connect: { id: user.userId } },
                  avatar: { connect: { id: dollBody.avatarId } },
                  scenario: { connect: { id: scenario.id } },
                },
              });
              chatId = chat.id;
              await enqueueCreated('chat', chat);
            }
          }
        }
      }

      // Create new
      const created = await prisma.doll.create({
        data: {
          macAddress: body.macAddress,
          dollBody: { connect: { id: body.dollBodyId } },
          ...(body.name ? { name: body.name } : {}),
          ...(chatId ? { chat: { connect: { id: chatId } } } : {}),
          user: { connect: { id: user.userId } },
        },
      });
      await enqueueCreated('doll', created);
      return created;
    },
    {
      body: Body({
        macAddress: t.String(),
        dollBodyId: t.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }),
        name: t.Optional(t.String()),
        chatId: t.Optional(t.String()),
      }),
    },
  )

  /* ── PATCH /dolls/:id ──────────────────────────────────────────── */
  .patch(
    '/:id',
    async ({ user, params, body, set }) => {
      const item = await prisma.doll.findUnique({ where: { id: params.id } });
      if (!item) { set.status = 404; return { error: 'Not found' }; }
      if (item.userId !== user.userId && user.role !== 'ADMIN') {
        set.status = 403;
        return { error: 'Not authorized' };
      }

      // Validate chatId if provided
      if (body.chatId !== undefined && body.chatId !== null) {
        const chat = await prisma.chat.findUnique({ where: { id: body.chatId } });
        if (!chat || chat.userId !== user.userId) {
          set.status = 403;
          return { error: 'Chat not found or not authorized' };
        }
      }

      const original = item;
      const updated = await prisma.doll.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.picture !== undefined ? { picture: body.picture } : {}),
          ...(body.chatId === null ? { chat: { disconnect: true } } : body.chatId !== undefined ? { chat: { connect: { id: body.chatId } } } : {}),
        },
      });
      await enqueueUpdated('doll', updated, original);
      return updated;
    },
    {
      body: Body({
        chatId: t.Optional(t.Nullable(t.String())),
        name: t.Optional(t.String()),
        picture: t.Optional(t.String()),
      }),
    },
  )

  /* ── DELETE /dolls/:id ─────────────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.doll.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') {
      set.status = 403;
      return { error: 'Not authorized' };
    }
    await enqueueDeleted('doll', item);
    return prisma.doll.delete({ where: { id: params.id } });
  });
