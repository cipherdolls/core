import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { saveAudio, serveAudio, deleteAudioFile } from './audios';

export const audiosRoutes = new Elysia({ prefix: '/audios' })

  /* ── GET /audios/:id/audio.mp3 ─────────────────────────────── */
  .get('/:id/audio.mp3', async ({ params }) => {
    const item = await prisma.audio.findUnique({ where: { id: params.id } });
    if (!item) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    return serveAudio(item.id);
  })

  /* ── GET /audios/by/:entityType/:entityId/audio.mp3 ────────── */
  .get('/by/:entityType/:entityId/audio.mp3', async ({ params }) => {
    const entityKeyMap: Record<string, string> = {
      'avatars': 'avatarId',
      'filler-words': 'fillerWordId',
      'tts-voices': 'ttsVoiceId',
    };

    const entityKey = entityKeyMap[params.entityType];
    if (!entityKey) return new Response(JSON.stringify({ error: 'Invalid entity type' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const item = await prisma.audio.findFirst({ where: { [entityKey]: params.entityId } });
    if (!item) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    return serveAudio(item.id);
  })

  /* ── Protected routes (POST, DELETE) ────────────────────────── */
  .use(jwtGuard)

  /* ── POST /audios ── upload an audio attached to an entity ──── */
  .post('/', async ({ user, body, set }) => {
    if (!body.file || body.file.size === 0) {
      set.status = 400;
      return { error: 'No file provided' };
    }

    const entityKeys = ['avatarId', 'fillerWordId', 'ttsVoiceId'] as const;
    const provided = entityKeys.filter((k) => (body as any)[k]);
    if (provided.length !== 1) {
      set.status = 400;
      return { error: 'Provide exactly one entity ID (e.g. avatarId, fillerWordId)' };
    }

    const entityKey = provided[0];
    const entityId = (body as any)[entityKey];

    // Delete existing audio for this entity (one-to-one)
    const existing = await prisma.audio.findFirst({ where: { [entityKey]: entityId } });
    if (existing) {
      deleteAudioFile(existing.id);
      await prisma.audio.delete({ where: { id: existing.id } });
    }

    const fileId = await saveAudio(body.file);

    const audio = await prisma.audio.create({
      data: {
        id: fileId,
        [entityKey]: entityId,
      },
    });
    return audio;
  }, {
    body: Body({
      file: t.File(),
      avatarId: t.Optional(t.String()),
      fillerWordId: t.Optional(t.String()),
      ttsVoiceId: t.Optional(t.String()),
    }),
  })

  /* ── DELETE /audios/:id ─────────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.audio.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    deleteAudioFile(item.id);
    return prisma.audio.delete({ where: { id: params.id } });
  });
