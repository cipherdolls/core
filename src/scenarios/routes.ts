import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard, optionalJwtGuard, verifyToken } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';

const scenarioInclude = {
  chatModel: { include: { aiProvider: true } },
  embeddingModel: { include: { aiProvider: true } },
  reasoningModel: { include: { aiProvider: true } },
  picture: true,
  avatars: true,
};

export const scenariosRoutes = new Elysia({ prefix: '/scenarios' })

  .use(optionalJwtGuard)

  /* ── GET /scenarios ──────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};

    if (query.name) where.name = { contains: query.name, mode: 'insensitive' };
    if (query.userGender) where.userGender = query.userGender;
    if (query.avatarGender) where.avatarGender = query.avatarGender;
    if (query.free === 'true') where.dollarPerMessage = 0;
    if (query.nsfw === 'true') where.nsfw = true;
    if (query.nsfw === 'false') where.nsfw = false;
    if (query.hasSponsorship === 'true') where.sponsorships = { some: {} };
    if (query.hasSponsorship === 'false') where.sponsorships = { none: {} };

    if (!user) {
      // Unauthenticated: only published
      where.published = true;
    } else if (query.mine === 'true') {
      where.userId = user.userId;
    } else if (query.published === 'true') {
      where.published = true;
    } else {
      // Authenticated default: own + published
      where.OR = [{ userId: user.userId }, { published: true }];
    }

    const [items, total] = await prisma.$transaction([
      prisma.scenario.findMany({ skip, take, where, include: scenarioInclude, orderBy: [{ recommended: 'desc' }, { name: 'asc' }] }),
      prisma.scenario.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /scenarios/:id ──────────────────────────────────────── */
  .get('/:id', async ({ params, set, user, headers }) => {
    // Resolve caller
    let caller = user;
    if (!caller && headers.authorization) {
      const token = headers.authorization.split(' ')[1];
      if (token) { try { caller = verifyToken(token); } catch {} }
    }
    const callerId = caller?.userId;

    // Filter nested avatars: show published + caller's own private avatars
    const include = {
      ...scenarioInclude,
      avatars: {
        where: {
          OR: [
            { published: true },
            ...(callerId ? [{ userId: callerId }] : []),
          ],
        },
        include: { picture: true },
        orderBy: { name: 'asc' as const },
      },
    };

    const item = await prisma.scenario.findUnique({ where: { id: params.id }, include });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    // Private scenarios: only owner or admin can view
    if (!item.published && (!caller || (item.userId !== caller.userId && caller.role !== 'ADMIN'))) {
      set.status = 403;
      return { error: 'Not authorized' };
    }
    return item;
  })

  .use(jwtGuard)

  /* ── POST /scenarios ─────────────────────────────────────────── */
  .post('/', async ({ user, body, set }) => {
    // Check minimum token spendable
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
    if (!dbUser || (Number(dbUser.tokenSpendable ?? 0) < 0.1 && user.role !== 'ADMIN')) {
      set.status = 403;
      return { error: 'Insufficient spendable tokens' };
    }

    const { chatModelId, embeddingModelId, reasoningModelId, avatarIds, ...rest } = body;
    // Auto-compute free flag based on dollarPerMessage
    const free = (rest.dollarPerMessage === undefined || rest.dollarPerMessage === 0) ? true : false;
    const item = await model.scenario.create({
      data: {
        ...rest,
        free,
        user: { connect: { id: user.userId } },
        chatModel: { connect: { id: chatModelId } },
        ...(embeddingModelId ? { embeddingModel: { connect: { id: embeddingModelId } } } : {}),
        ...(reasoningModelId ? { reasoningModel: { connect: { id: reasoningModelId } } } : {}),
        ...(avatarIds ? { avatars: { connect: avatarIds.map((id: string) => ({ id })) } } : {}),
      },
      include: scenarioInclude,
    });
    return item;
  }, {
    body: Body({
      name: t.String(),
      systemMessage: t.String(),
      type: t.Optional(t.Union([t.Literal('NORMAL'), t.Literal('ROLEPLAY')])),
      chatModelId: t.String(),
      embeddingModelId: t.Optional(t.String()),
      reasoningModelId: t.Optional(t.String()),
      greeting: t.Optional(t.String()),
      temperature: t.Optional(t.Number()),
      topP: t.Optional(t.Number()),
      frequencyPenalty: t.Optional(t.Number()),
      presencePenalty: t.Optional(t.Number()),
      dollarPerMessage: t.Optional(t.Number()),
      nsfw: t.Optional(t.Boolean()),
      userGender: t.Optional(t.String()),
      avatarGender: t.Optional(t.String()),
      avatarIds: t.Optional(t.Array(t.String())),
    }),
  })

  /* ── PATCH /scenarios/:id ────────────────────────────────────── */
  .patch('/:id', async ({ user, params, body, set }) => {
    const item = await prisma.scenario.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }

    const { chatModelId, embeddingModelId, reasoningModelId, avatarIds, ...rest } = body;
    // Auto-compute free flag when dollarPerMessage changes
    if (body.dollarPerMessage !== undefined) {
      (rest as any).free = body.dollarPerMessage === 0;
    }
    const updated = await model.scenario.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(chatModelId ? { chatModel: { connect: { id: chatModelId } } } : {}),
        ...(embeddingModelId ? { embeddingModel: { connect: { id: embeddingModelId } } } : embeddingModelId === null ? { embeddingModel: { disconnect: true } } : {}),
        ...(reasoningModelId ? { reasoningModel: { connect: { id: reasoningModelId } } } : reasoningModelId === null ? { reasoningModel: { disconnect: true } } : {}),
        ...(avatarIds ? { avatars: { set: avatarIds.map((id: string) => ({ id })) } } : {}),
      },
      include: scenarioInclude,
    }, item);
    return updated;
  }, {
    body: Body({
      name: t.Optional(t.String()),
      systemMessage: t.Optional(t.String()),
      type: t.Optional(t.Union([t.Literal('NORMAL'), t.Literal('ROLEPLAY')])),
      chatModelId: t.Optional(t.String()),
      embeddingModelId: t.Optional(t.Union([t.String(), t.Null()])),
      reasoningModelId: t.Optional(t.Union([t.String(), t.Null()])),
      greeting: t.Optional(t.String()),
      temperature: t.Optional(t.Number()),
      topP: t.Optional(t.Number()),
      frequencyPenalty: t.Optional(t.Number()),
      presencePenalty: t.Optional(t.Number()),
      dollarPerMessage: t.Optional(t.Number()),
      nsfw: t.Optional(t.Boolean()),
      published: t.Optional(t.Boolean()),
      recommended: t.Optional(t.Boolean()),
      userGender: t.Optional(t.Union([t.String(), t.Null()])),
      avatarGender: t.Optional(t.Union([t.String(), t.Null()])),
      avatarIds: t.Optional(t.Array(t.String())),
    }),
  })

  /* ── DELETE /scenarios/:id ───────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.scenario.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    // Published scenarios cannot be deleted by owner (only admin)
    if (item.published && user.role !== 'ADMIN') { set.status = 403; return { error: 'Cannot delete a published scenario' }; }
    return model.scenario.delete({ where: { id: params.id } });
  });
