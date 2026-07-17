import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';
import { buildPrompt, resolveStyle } from '../tti/prompt';

/**
 * Text-to-image jobs. Two targets:
 * - Avatar: the avatar's `appearance` anchors the subject; the optional
 *   `prompt` adds scene/pose/outfit on top. Result appends to the gallery.
 * - Group: prompt-driven cover generation (groups have no appearance; the
 *   prompt is required). Result replaces the group picture.
 * The house style template (src/tti/prompt.ts) frames everything.
 */
export const ttiJobsRoutes = new Elysia({ prefix: '/tti-jobs' })
  .use(jwtGuard)

  /* ── GET /tti-jobs ─────────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where = {
      ...(user.role === 'ADMIN' ? {} : { userId: user.userId }),
      ...(query.avatarId ? { avatarId: query.avatarId } : {}),
      ...(query.groupId ? { groupId: query.groupId } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.ttiJob.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.ttiJob.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /tti-jobs/:id ─────────────────────────────────────────── */
  .get('/:id', async ({ user, params, set }) => {
    const item = await prisma.ttiJob.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    return item;
  })

  /* ── POST /tti-jobs ── generate for an avatar or a group ───────── */
  .post(
    '/',
    async ({ user, body, set }) => {
      if (!body.avatarId === !body.groupId) {
        set.status = 400;
        return { error: 'Provide exactly one of avatarId or groupId' };
      }

      if (body.groupId) {
        // Group cover. Subject: explicit prompt, or derived from the members'
        // appearances (a group portrait of up to three of its avatars).
        const group = await prisma.group.findUnique({
          where: { id: body.groupId },
          include: { avatars: { where: { appearance: { not: null } }, take: 3, select: { appearance: true } } },
        });
        if (!group) { set.status = 404; return { error: 'Group not found' }; }
        if (group.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }

        let subject = body.prompt;
        if (!subject) {
          const appearances = group.avatars.map((a) => a.appearance!).filter(Boolean);
          if (appearances.length === 0) {
            set.status = 400;
            return { error: 'Group has no avatars with an appearance — pass a prompt' };
          }
          subject = appearances.length === 1
            ? appearances[0]
            : `a group of ${appearances.length} companions together: ` + appearances.map((a, i) => `(${i + 1}) ${a}`).join('; ');
        }

        const style = await resolveStyle(body.ttiStyleId);
        return model.ttiJob.create({
          data: {
            prompt: buildPrompt(style.template, subject),
            group: { connect: { id: group.id } },
            user: { connect: { id: user.userId } },
            ...(style.id ? { ttiStyle: { connect: { id: style.id } } } : {}),
            ...(body.seed !== undefined ? { seed: body.seed } : {}),
            // Covers are wide by default (group cards are landscape).
            width: body.width ?? 1216,
            height: body.height ?? 832,
          },
        });
      }

      const avatar = await prisma.avatar.findUnique({ where: { id: body.avatarId! } });
      if (!avatar) { set.status = 404; return { error: 'Avatar not found' }; }
      if (avatar.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
      if (!avatar.appearance && !body.prompt) {
        set.status = 400;
        return { error: 'Avatar has no appearance — set one or pass a prompt' };
      }

      // Style: explicit request > the avatar's chosen style > platform default.
      const style = await resolveStyle(body.ttiStyleId ?? avatar.ttiStyleId);
      const prompt = avatar.appearance
        ? buildPrompt(style.template, avatar.appearance, body.prompt)
        : buildPrompt(style.template, body.prompt!);

      return model.ttiJob.create({
        data: {
          prompt,
          avatar: { connect: { id: avatar.id } },
          user: { connect: { id: user.userId } },
          ...(style.id ? { ttiStyle: { connect: { id: style.id } } } : {}),
          ...(body.seed !== undefined ? { seed: body.seed } : {}),
          width: body.width ?? style.width,
          height: body.height ?? style.height,
        },
      });
    },
    {
      body: Body({
        avatarId: t.Optional(t.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' })),
        groupId: t.Optional(t.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' })),
        prompt: t.Optional(t.String({ maxLength: 2000 })),
        ttiStyleId: t.Optional(t.String()),
        seed: t.Optional(t.Integer({ minimum: 0 })),
        width: t.Optional(t.Integer({ minimum: 256, maximum: 2048, multipleOf: 16 })),
        height: t.Optional(t.Integer({ minimum: 256, maximum: 2048, multipleOf: 16 })),
      }),
    },
  );
