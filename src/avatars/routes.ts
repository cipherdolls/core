import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard, optionalJwtGuard, verifyToken } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';
import { enqueueCreated, enqueueUpdated, enqueueDeleted } from '../queue/enqueue';

const avatarInclude = {
  ttsVoice: true,
  scenarios: true,
  _count: { select: { chats: true } },
  picture: true,
};

export const avatarsRoutes = new Elysia({ prefix: '/avatars' })

  .use(optionalJwtGuard)

  /* ── GET /avatars ────────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};

    if (query.name) where.name = { contains: query.name, mode: 'insensitive' };
    if (query.gender) where.gender = query.gender;
    if (query.recommended === 'true') where.recommended = true;
    if (query.free === 'true') where.free = true;

    if (!user) {
      // Unauthenticated: only published
      where.published = true;
    } else if (query.mine === 'true') {
      where.userId = user.userId;
    } else if (query.published === 'true') {
      where.published = true;
    } else if (query.chat === 'true') {
      where.chats = { some: { userId: user.userId } };
    } else {
      // Authenticated default: own + chatted-with
      where.OR = [{ userId: user.userId }, { chats: { some: { userId: user.userId } } }];
    }

    const [items, total] = await prisma.$transaction([
      prisma.avatar.findMany({ skip, take, where, include: avatarInclude, orderBy: [{ recommended: 'desc' }, { name: 'asc' }] }),
      prisma.avatar.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /avatars/:id ────────────────────────────────────────── */
  .get('/:id', async ({ params, set, user, headers }) => {
    // Resolve caller: use derived user from optionalJwtGuard, fall back to manual token extraction
    let caller = user;
    if (!caller && headers.authorization) {
      const token = headers.authorization.split(' ')[1];
      if (token) { try { caller = verifyToken(token); } catch {} }
    }
    const callerId = caller?.userId;

    // Filter nested scenarios: show published + caller's own private scenarios
    const include = {
      ...avatarInclude,
      scenarios: {
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

    const item = await prisma.avatar.findUnique({ where: { id: params.id }, include });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    // Private avatars: only owner or admin can view
    if (!item.published && (!caller || (item.userId !== caller.userId && caller.role !== 'ADMIN'))) {
      set.status = 403;
      return { error: 'Not authorized' };
    }
    return item;
  })

  .use(jwtGuard)

  /* ── POST /avatars ───────────────────────────────────────────── */
  .post('/', async ({ user, body, set }) => {
    // Check minimum token spendable
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
    if (!dbUser || (Number(dbUser.tokenSpendable ?? 0) < 0.1 && user.role !== 'ADMIN')) {
      set.status = 403;
      return { error: 'Insufficient spendable tokens' };
    }

    const { recommended, ttsVoiceId, scenarioIds, published, ...rest } = body;

    // Enforce publication rule: all assigned scenarios must be published
    if (published === true && Array.isArray(scenarioIds) && scenarioIds.length > 0) {
      const scenarios = await prisma.scenario.findMany({ where: { id: { in: scenarioIds } } });
      const unpublished = scenarios.filter((s) => !s.published);
      if (unpublished.length > 0) {
        set.status = 400;
        return { statusCode: 400, message: 'avatar can only be published if all assigned scenarios are published.' };
      }
    }

    // Compute free based on TTS provider cost
    const ttsVoice = await prisma.ttsVoice.findUnique({ where: { id: ttsVoiceId }, include: { ttsProvider: true } });
    const free = ttsVoice ? Number(ttsVoice.ttsProvider.dollarPerCharacter) === 0 : false;

    const item = await prisma.avatar.create({
      data: {
        ...rest,
        free,
        published: published ?? false,
        ...(user.role === 'ADMIN' && recommended !== undefined ? { recommended } : {}),
        user: { connect: { id: user.userId } },
        ttsVoice: { connect: { id: ttsVoiceId } },
        ...(scenarioIds ? { scenarios: { connect: scenarioIds.map((id: string) => ({ id })) } } : {}),
      },
      include: avatarInclude,
    });
    await enqueueCreated('avatar', item);
    return item;
  }, {
    body: Body({
      name: t.String(),
      shortDesc: t.String(),
      character: t.String(),
      ttsVoiceId: t.String(),
      language: t.Optional(t.String()),
      gender: t.Optional(t.String()),
      published: t.Optional(t.Boolean()),
      recommended: t.Optional(t.Boolean()),
      scenarioIds: t.Optional(t.Array(t.String())),
    }),
  })

  /* ── PATCH /avatars/:id ──────────────────────────────────────── */
  .patch('/:id', async ({ user, params, body, set }) => {
    const item = await prisma.avatar.findUnique({ where: { id: params.id }, include: { scenarios: true } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }

    // Non-admin cannot set recommended
    if (body.recommended !== undefined && user.role !== 'ADMIN') { set.status = 403; return { error: 'Only admins can set recommended on avatars' }; }

    const { ttsVoiceId, recommended, scenarioIds, published, ...rest } = body;

    // Determine final scenario IDs for publish validation
    const finalScenarioIds = scenarioIds ?? (item as any).scenarios?.map((s: any) => s.id) ?? [];

    // Enforce publication rule when publishing
    const isPublishing = !item.published && published === true;
    if (isPublishing && finalScenarioIds.length > 0) {
      const scenarios = await prisma.scenario.findMany({ where: { id: { in: finalScenarioIds } } });
      const unpublished = scenarios.filter((s) => !s.published);
      if (unpublished.length > 0) {
        set.status = 400;
        return { statusCode: 400, message: 'avatar can only be published if all assigned scenarios are published.' };
      }
    }

    const original = item;
    const updated = await prisma.avatar.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(published !== undefined ? { published } : {}),
        ...(user.role === 'ADMIN' && recommended !== undefined ? { recommended } : {}),
        ...(ttsVoiceId ? { ttsVoice: { connect: { id: ttsVoiceId } } } : {}),
        ...(scenarioIds ? { scenarios: { set: scenarioIds.map((id: string) => ({ id })) } } : {}),
      },
      include: avatarInclude,
    });
    await enqueueUpdated('avatar', updated, original);
    return updated;
  }, {
    body: Body({
      name: t.Optional(t.String()),
      shortDesc: t.Optional(t.String()),
      character: t.Optional(t.String()),
      ttsVoiceId: t.Optional(t.String()),
      language: t.Optional(t.String()),
      gender: t.Optional(t.String()),
      published: t.Optional(t.Boolean()),
      recommended: t.Optional(t.Boolean()),
      scenarioIds: t.Optional(t.Array(t.String())),
    }),
  })

  /* ── DELETE /avatars/:id ─────────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.avatar.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    const deleted = await prisma.avatar.delete({ where: { id: params.id } });
    await enqueueDeleted('avatar', deleted);
    return deleted;
  });
