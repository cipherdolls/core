import { Body, pickFields } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard, optionalJwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';
import { enqueueGroupCover } from '../tti/groupCover';

/** Non-admins may only group published content or their own. Returns an error string or null. */
async function validateMembers(user: { userId: string; role: string }, avatarIds?: string[], scenarioIds?: string[]): Promise<string | null> {
  if (user.role === 'ADMIN') return null;
  if (avatarIds?.length) {
    const allowed = await prisma.avatar.count({
      where: { id: { in: avatarIds }, OR: [{ published: true }, { userId: user.userId }] },
    });
    if (allowed !== avatarIds.length) return 'Can only group published avatars or your own';
  }
  if (scenarioIds?.length) {
    const allowed = await prisma.scenario.count({
      where: { id: { in: scenarioIds }, OR: [{ published: true }, { userId: user.userId }] },
    });
    if (allowed !== scenarioIds.length) return 'Can only group published scenarios or your own';
  }
  return null;
}

const groupInclude = {
  picture: true,
  _count: { select: { avatars: true, scenarios: true } },
};

const groupDetailInclude = {
  picture: true,
  avatars: { include: { pictures: { orderBy: { createdAt: 'desc' as const } }, ttsVoice: true } },
  scenarios: { include: { picture: true } },
  _count: { select: { avatars: true, scenarios: true } },
};

export const groupsRoutes = new Elysia({ prefix: '/groups' })

  .use(optionalJwtGuard)

  /* ── GET /groups ─────────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};

    if (query.name) where.name = { contains: query.name, mode: 'insensitive' };

    if (!user) {
      // Unauthenticated: only published
      where.published = true;
    } else if (query.all === 'true' && user.role === 'ADMIN') {
      // Admin: no scoping — list every group
    } else if (query.mine === 'true') {
      where.userId = user.userId;
    } else {
      // Authenticated default: own + published
      where.OR = [{ userId: user.userId }, { published: true }];
    }

    const [items, total] = await prisma.$transaction([
      prisma.group.findMany({ skip, take, where, include: groupInclude, orderBy: { name: 'asc' } }),
      prisma.group.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /groups/:idOrSlug ───────────────────────────────────── */
  .get('/:idOrSlug', async ({ user, params, set }) => {
    const item = await prisma.group.findFirst({
      where: { OR: [{ id: params.idOrSlug }, { slug: params.idOrSlug }] },
      include: groupDetailInclude,
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    const isOwnerOrAdmin = user && (item.userId === user.userId || user.role === 'ADMIN');
    if (!item.published && !isOwnerOrAdmin) { set.status = 404; return { error: 'Not found' }; }

    // Only the owner and admins see the group's unpublished members
    if (!isOwnerOrAdmin) {
      item.avatars = item.avatars.filter((a) => a.published);
      item.scenarios = item.scenarios.filter((s) => s.published);
    }
    return item;
  })

  .use(jwtGuard)

  /* ── POST /groups ────────────────────────────────────────────── */
  .post('/', async ({ user, body, set }) => {
    // Check minimum token spendable (same gate as avatars/scenarios)
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
    if (!dbUser || (Number(dbUser.tokenSpendable ?? 0) < 0.1 && user.role !== 'ADMIN')) {
      set.status = 403;
      return { error: 'Insufficient spendable tokens' };
    }

    const { avatarIds, scenarioIds, ...rest } = body;

    const existing = await prisma.group.findUnique({ where: { slug: rest.slug } });
    if (existing) { set.status = 400; return { error: 'Slug already in use' }; }

    const memberError = await validateMembers(user, avatarIds, scenarioIds);
    if (memberError) { set.status = 400; return { error: memberError }; }

    const item = await model.group.create({
      data: {
        ...rest,
        user: { connect: { id: user.userId } },
        ...(avatarIds ? { avatars: { connect: avatarIds.map((id: string) => ({ id })) } } : {}),
        ...(scenarioIds ? { scenarios: { connect: scenarioIds.map((id: string) => ({ id })) } } : {}),
      },
      include: groupInclude,
    });
    // Members set at creation → generate the cover from their appearances.
    if (avatarIds?.length) enqueueGroupCover(item.id).catch((e) => console.error('[groups] cover enqueue failed:', e.message));
    return item;
  }, {
    body: Body({
      name: t.String(),
      slug: t.String({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' }),
      title: t.Optional(t.String()),
      description: t.Optional(t.String()),
      published: t.Optional(t.Boolean()),
      avatarIds: t.Optional(t.Array(t.String())),
      scenarioIds: t.Optional(t.Array(t.String())),
    }),
  })

  /* ── PATCH /groups/:id ───────────────────────────────────────── */
  .patch('/:id', async ({ user, params, body, set }) => {
    const item = await prisma.group.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }

    if (body.slug && body.slug !== item.slug) {
      const existing = await prisma.group.findUnique({ where: { slug: body.slug } });
      if (existing) { set.status = 400; return { error: 'Slug already in use' }; }
    }

    const { avatarIds, scenarioIds } = body;
    const memberError = await validateMembers(user, avatarIds, scenarioIds);
    if (memberError) { set.status = 400; return { error: memberError }; }

    const data = pickFields(body, ['name', 'slug', 'title', 'description', 'published']);

    const updated = await model.group.update({
      where: { id: params.id },
      data: {
        ...data,
        ...(avatarIds ? { avatars: { set: avatarIds.map((id: string) => ({ id })) } } : {}),
        ...(scenarioIds ? { scenarios: { set: scenarioIds.map((id: string) => ({ id })) } } : {}),
      },
      include: groupInclude,
    }, item);
    // Membership changed → regenerate the cover from the new lineup.
    if (avatarIds) enqueueGroupCover(item.id).catch((e) => console.error('[groups] cover enqueue failed:', e.message));
    return updated;
  }, {
    body: Body({
      name: t.Optional(t.String()),
      slug: t.Optional(t.String({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' })),
      title: t.Optional(t.String()),
      description: t.Optional(t.String()),
      published: t.Optional(t.Boolean()),
      avatarIds: t.Optional(t.Array(t.String())),
      scenarioIds: t.Optional(t.Array(t.String())),
    }),
  })

  /* ── DELETE /groups/:id ──────────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.group.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    return model.group.delete({ where: { id: params.id } });
  });
