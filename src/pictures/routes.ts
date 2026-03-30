import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { savePicture, servePicture } from './pictures';

export const picturesRoutes = new Elysia({ prefix: '/pictures' })

  /* ── GET /pictures/:id/picture.webp ──────────────────────────── */
  .get('/:id/picture.webp', async ({ params, query }) => {
    const x = parseInt(query.x ?? '100');
    const y = parseInt(query.y ?? '100');

    const item = await prisma.picture.findUnique({ where: { id: params.id } });
    if (!item) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    return servePicture(item.id, x, y, 'webp');
  })

  /* ── GET /pictures/:id/picture.jpg ───────────────────────────── */
  .get('/:id/picture.jpg', async ({ params, query }) => {
    const x = parseInt(query.x ?? '100');
    const y = parseInt(query.y ?? '100');

    const item = await prisma.picture.findUnique({ where: { id: params.id } });
    if (!item) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    return servePicture(item.id, x, y, 'jpeg');
  })

  /* ── GET /pictures/by/:entityType/:entityId/picture.webp ────── */
  .get('/by/:entityType/:entityId/picture.webp', async ({ params, query }) => {
    const x = parseInt(query.x ?? '100');
    const y = parseInt(query.y ?? '100');

    const entityKeyMap: Record<string, string> = {
      'avatars': 'avatarId',
      'dolls': 'dollId',
      'doll-bodies': 'dollBodyId',
      'scenarios': 'scenarioId',
      'ai-providers': 'aiProviderId',
      'stt-providers': 'sttProviderId',
      'tts-providers': 'ttsProviderId',
    };

    const entityKey = entityKeyMap[params.entityType];
    if (!entityKey) return new Response(JSON.stringify({ error: 'Invalid entity type' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const item = await prisma.picture.findFirst({ where: { [entityKey]: params.entityId } });
    if (!item) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    return servePicture(item.id, x, y, 'webp');
  })

  /* ── Protected routes (POST, DELETE) ────────────────────────── */
  .use(jwtGuard)

  /* ── POST /pictures ── upload a picture attached to an entity ──── */
  .post('/', async ({ user, body, set }) => {
    if (!body.file || body.file.size === 0) {
      set.status = 400;
      return { error: 'No file provided' };
    }

    // Exactly one entity ID must be provided
    const entityKeys = ['dollId', 'dollBodyId', 'avatarId', 'scenarioId', 'sttProviderId', 'aiProviderId', 'ttsProviderId'] as const;
    const provided = entityKeys.filter((k) => (body as any)[k]);
    if (provided.length !== 1) {
      set.status = 400;
      return { error: 'Provide exactly one entity ID (e.g. aiProviderId, avatarId, scenarioId, ...)' };
    }

    const entityKey = provided[0];
    const entityId = (body as any)[entityKey];

    // Delete existing picture for this entity (one-to-one)
    const existing = await prisma.picture.findFirst({ where: { [entityKey]: entityId } });
    if (existing) {
      await prisma.picture.delete({ where: { id: existing.id } });
    }

    const fileId = await savePicture(body.file);

    const picture = await prisma.picture.create({
      data: {
        id: fileId,
        [entityKey]: entityId,
      },
    });
    return picture;
  }, {
    body: Body({
      file: t.File(),
      dollId: t.Optional(t.String()),
      dollBodyId: t.Optional(t.String()),
      avatarId: t.Optional(t.String()),
      scenarioId: t.Optional(t.String()),
      sttProviderId: t.Optional(t.String()),
      aiProviderId: t.Optional(t.String()),
      ttsProviderId: t.Optional(t.String()),
    }),
  })

  /* ── DELETE /pictures/:id ────────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.picture.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return prisma.picture.delete({ where: { id: params.id } });
  });
