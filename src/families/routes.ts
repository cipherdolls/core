import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard, optionalJwtGuard, verifyToken } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';

const familyInclude = {
  picture: true,
  avatars: { include: { picture: true } },
  _count: { select: { avatars: true } },
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** All bundled avatars must be published or owned by the caller */
async function validateAvatarAccess(avatarIds: string[], userId: string, isAdmin: boolean) {
  if (avatarIds.length === 0) return null;
  const avatars = await prisma.avatar.findMany({ where: { id: { in: avatarIds } } });
  if (avatars.length !== avatarIds.length) {
    return 'one or more avatars do not exist.';
  }
  if (!isAdmin && avatars.some((a) => !a.published && a.userId !== userId)) {
    return 'family can only contain published avatars or your own avatars.';
  }
  return null;
}

/** A family can only be published if all bundled avatars are published */
async function validatePublishable(avatarIds: string[]) {
  if (avatarIds.length === 0) return null;
  const avatars = await prisma.avatar.findMany({ where: { id: { in: avatarIds } } });
  if (avatars.some((a) => !a.published)) {
    return 'family can only be published if all bundled avatars are published.';
  }
  return null;
}

export const familiesRoutes = new Elysia({ prefix: '/families' })

  .use(optionalJwtGuard)

  /* ── GET /families ───────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where: any = {};

    if (query.name) where.name = { contains: query.name, mode: 'insensitive' };

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
      prisma.family.findMany({ skip, take, where, include: familyInclude, orderBy: { name: 'asc' } }),
      prisma.family.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /families/:idOrSlug ─────────────────────────────────── */
  // Webapps dedicated to a family fetch their avatar bundle here by slug.
  .get('/:idOrSlug', async ({ params, set, user, headers }) => {
    // Resolve caller: use derived user from optionalJwtGuard, fall back to manual token extraction
    let caller = user;
    if (!caller && headers.authorization) {
      const token = headers.authorization.split(' ')[1];
      if (token) { try { caller = verifyToken(token); } catch {} }
    }
    const callerId = caller?.userId;

    // Filter nested avatars: show published + caller's own private avatars
    const include = {
      ...familyInclude,
      avatars: {
        where: {
          OR: [
            { published: true },
            ...(callerId ? [{ userId: callerId }] : []),
          ],
        },
        include: { picture: true, ttsVoice: true },
        orderBy: [{ recommended: 'desc' as const }, { name: 'asc' as const }],
      },
    };

    const item = await prisma.family.findFirst({
      where: { OR: [{ id: params.idOrSlug }, { slug: params.idOrSlug }] },
      include,
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    // Private families: only owner or admin can view
    if (!item.published && (!caller || (item.userId !== caller.userId && caller.role !== 'ADMIN'))) {
      set.status = 403;
      return { error: 'Not authorized' };
    }
    return item;
  })

  .use(jwtGuard)

  /* ── POST /families ──────────────────────────────────────────── */
  .post('/', async ({ user, body, set }) => {
    // Check minimum token spendable
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
    if (!dbUser || (Number(dbUser.tokenSpendable ?? 0) < 0.1 && user.role !== 'ADMIN')) {
      set.status = 403;
      return { error: 'Insufficient spendable tokens' };
    }

    const { avatarIds, published, slug: rawSlug, ...rest } = body;

    const slug = rawSlug ?? slugify(rest.name);
    if (!SLUG_PATTERN.test(slug)) {
      set.status = 400;
      return { statusCode: 400, message: 'slug must contain only lowercase letters, numbers and hyphens.' };
    }
    const existing = await prisma.family.findUnique({ where: { slug } });
    if (existing) {
      set.status = 409;
      return { statusCode: 409, message: `slug "${slug}" is already taken.` };
    }

    const accessError = await validateAvatarAccess(avatarIds ?? [], user.userId, user.role === 'ADMIN');
    if (accessError) { set.status = 400; return { statusCode: 400, message: accessError }; }

    if (published === true) {
      const publishError = await validatePublishable(avatarIds ?? []);
      if (publishError) { set.status = 400; return { statusCode: 400, message: publishError }; }
    }

    const item = await model.family.create({
      data: {
        ...rest,
        slug,
        published: published ?? false,
        user: { connect: { id: user.userId } },
        ...(avatarIds ? { avatars: { connect: avatarIds.map((id: string) => ({ id })) } } : {}),
      },
      include: familyInclude,
    });
    return item;
  }, {
    body: Body({
      name: t.String(),
      slug: t.Optional(t.String()),
      shortDesc: t.Optional(t.String()),
      published: t.Optional(t.Boolean()),
      avatarIds: t.Optional(t.Array(t.String())),
    }),
  })

  /* ── PATCH /families/:id ─────────────────────────────────────── */
  .patch('/:id', async ({ user, params, body, set }) => {
    const item = await prisma.family.findUnique({ where: { id: params.id }, include: { avatars: true } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }

    const { avatarIds, published, slug, ...rest } = body;

    if (slug !== undefined) {
      if (!SLUG_PATTERN.test(slug)) {
        set.status = 400;
        return { statusCode: 400, message: 'slug must contain only lowercase letters, numbers and hyphens.' };
      }
      const existing = await prisma.family.findUnique({ where: { slug } });
      if (existing && existing.id !== item.id) {
        set.status = 409;
        return { statusCode: 409, message: `slug "${slug}" is already taken.` };
      }
    }

    if (avatarIds) {
      const accessError = await validateAvatarAccess(avatarIds, user.userId, user.role === 'ADMIN');
      if (accessError) { set.status = 400; return { statusCode: 400, message: accessError }; }
    }

    // Determine final avatar IDs for publish validation
    const finalAvatarIds = avatarIds ?? item.avatars.map((a) => a.id);

    // Enforce publication rule when publishing (or changing members of a published family)
    const willBePublished = published ?? item.published;
    if (willBePublished && (published === true || avatarIds)) {
      const publishError = await validatePublishable(finalAvatarIds);
      if (publishError) { set.status = 400; return { statusCode: 400, message: publishError }; }
    }

    const updated = await model.family.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(slug !== undefined ? { slug } : {}),
        ...(published !== undefined ? { published } : {}),
        ...(avatarIds ? { avatars: { set: avatarIds.map((id: string) => ({ id })) } } : {}),
      },
      include: familyInclude,
    }, item);
    return updated;
  }, {
    body: Body({
      name: t.Optional(t.String()),
      slug: t.Optional(t.String()),
      shortDesc: t.Optional(t.String()),
      published: t.Optional(t.Boolean()),
      avatarIds: t.Optional(t.Array(t.String())),
    }),
  })

  /* ── DELETE /families/:id ────────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.family.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    return model.family.delete({ where: { id: params.id } });
  });
