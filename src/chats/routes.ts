import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { jwtGuard } from '../auth/jwt';
import { parsePagination, paginationMeta } from '../helpers/pagination';
import { enqueueCreated, enqueueUpdated, enqueueDeleted } from '../queue/enqueue';

const chatListInclude = {
  avatar: true,
  scenario: true,
  _count: { select: { messages: true, chatCompletionJobs: true } },
};

const chatDetailInclude = {
  avatar: true,
  scenario: {
    include: {
      chatModel: { include: { aiProvider: true } },
      embeddingModel: { include: { aiProvider: true } },
      reasoningModel: { include: { aiProvider: true } },
    },
  },
  sttProvider: true,
  doll: { include: { dollBody: true } },
  _count: { select: { messages: true, chatCompletionJobs: true } },
};

export const chatsRoutes = new Elysia({ prefix: '/chats' })

  .use(jwtGuard)

  /* ── GET /chats ──────────────────────────────────────────────── */
  .get('/', async ({ user, query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);
    const where = { userId: user.userId };

    const [items, total] = await prisma.$transaction([
      prisma.chat.findMany({ skip, take, where, include: chatListInclude, orderBy: { createdAt: 'desc' } }),
      prisma.chat.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /chats/:id ──────────────────────────────────────────── */
  .get('/:id', async ({ user, params, set }) => {
    const item = await prisma.chat.findUnique({ where: { id: params.id }, include: chatDetailInclude });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    // Hide existence from non-owner (return 404 instead of 403)
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  /* ── GET /chats/:id/system-prompt ──────────────────────────────── */
  .get('/:id/system-prompt', async ({ user, params, set }) => {
    const chat = await prisma.chat.findUnique({
      where: { id: params.id },
      include: {
        user: true,
        avatar: true,
        scenario: true,
      },
    });
    if (!chat) { set.status = 404; return 'Not found'; }
    if (chat.userId !== user.userId && user.role !== 'ADMIN') { set.status = 404; return 'Not found'; }

    const parts: string[] = [];
    parts.push('### Introduction');
    parts.push(chat.scenario?.systemMessage ?? '');
    parts.push('');
    parts.push('### Avatar Personality');
    parts.push(chat.avatar?.character ?? '');
    parts.push('');
    parts.push('### User');
    parts.push(`Name: ${chat.user?.name ?? 'User'}`);
    if (chat.user?.gender) parts.push(`Gender: ${chat.user.gender}`);
    if (chat.user?.language) parts.push(`Language: ${chat.user.language}`);
    parts.push('');
    parts.push('### Scenario');
    parts.push(`Name: ${chat.scenario?.name ?? ''}`);
    if (chat.scenario?.type) parts.push(`Type: ${chat.scenario.type}`);
    if (chat.scenario?.greeting) parts.push(`Greeting: ${chat.scenario.greeting}`);

    set.headers = { 'content-type': 'text/plain' };
    return parts.join('\n');
  })

  /* ── POST /chats ─────────────────────────────────────────────── */
  .post('/', async ({ user, body, set }) => {
    // Validate avatar exists
    const avatar = await prisma.avatar.findUnique({ where: { id: body.avatarId } });
    if (!avatar) { set.status = 404; return { error: 'Avatar not found' }; }

    // Validate scenario exists
    const scenario = await prisma.scenario.findUnique({ where: { id: body.scenarioId } });
    if (!scenario) { set.status = 404; return { error: 'Scenario not found' }; }

    // Token balance enforcement — free scenarios/avatars skip the check
    const isFreeScenario = scenario.free;
    const avatarWithVoice = await prisma.avatar.findUnique({ where: { id: body.avatarId }, include: { ttsVoice: { include: { ttsProvider: true } } } });
    const isFreeAvatar = avatarWithVoice?.free;

    if (!isFreeScenario || !isFreeAvatar) {
      const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
      const minimumSpendable = 0.1;
      const hasEnoughTokens = Number(dbUser?.tokenSpendable ?? 0) >= minimumSpendable;
      const sponsorships = await prisma.sponsorship.findMany({ where: { scenarioId: scenario.id } });
      const hasSponsorship = sponsorships.length > 0;
      if (!(hasEnoughTokens || hasSponsorship)) { set.status = 403; return { error: 'Insufficient tokens or sponsorship' }; }
    }

    const chat = await prisma.chat.create({
      data: {
        user: { connect: { id: user.userId } },
        avatar: { connect: { id: body.avatarId } },
        scenario: { connect: { id: body.scenarioId } },
        ...(body.tts !== undefined ? { tts: body.tts } : {}),
      },
      include: chatDetailInclude,
    });

    await enqueueCreated('chat', chat);

    // Create greeting message if scenario has one (enqueue AFTER chat so processors run in order)
    if (scenario?.greeting) {
      const greetingMessage = await prisma.message.create({
        data: {
          role: 'ASSISTANT',
          content: scenario.greeting,
          chat: { connect: { id: chat.id } },
          user: { connect: { id: user.userId } },
        },
      });
      await enqueueCreated('message', greetingMessage);
    }
    return chat;
  }, {
    body: Body({
      avatarId: t.String(),
      scenarioId: t.String(),
      tts: t.Optional(t.Boolean()),
    }),
  })

  /* ── PATCH /chats/:id ────────────────────────────────────────── */
  .patch('/:id', async ({ user, params, body, set }) => {
    const item = await prisma.chat.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }

    const original = item;
    const { sttProviderId, scenarioId, avatarId, ...rest } = body;

    // Validate related resources exist
    if (avatarId) {
      const avatar = await prisma.avatar.findUnique({ where: { id: avatarId } });
      if (!avatar) { set.status = 404; return { error: 'Avatar not found' }; }
    }
    if (scenarioId) {
      const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } });
      if (!scenario) { set.status = 404; return { error: 'Scenario not found' }; }
    }
    if (sttProviderId) {
      const sttProvider = await prisma.sttProvider.findUnique({ where: { id: sttProviderId } });
      if (!sttProvider) { set.status = 404; return { error: 'STT Provider not found' }; }
    }

    const updated = await prisma.chat.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(sttProviderId ? { sttProvider: { connect: { id: sttProviderId } } } : {}),
        ...(scenarioId ? { scenario: { connect: { id: scenarioId } } } : {}),
        ...(avatarId ? { avatar: { connect: { id: avatarId } } } : {}),
      },
      include: chatDetailInclude,
    });
    await enqueueUpdated('chat', updated, original);
    return updated;
  }, {
    body: Body({
      avatarId: t.Optional(t.String()),
      sttProviderId: t.Optional(t.String()),
      scenarioId: t.Optional(t.String()),
      tts: t.Optional(t.Boolean()),
      action: t.Optional(t.Union([t.Literal('Init'), t.Literal('RefreshSystemPrompt'), t.Literal('Summarize'), t.Literal('Nothing')])),
    }),
  })

  /* ── DELETE /chats/:id ───────────────────────────────────────── */
  .delete('/:id', async ({ user, params, set }) => {
    const item = await prisma.chat.findUnique({ where: { id: params.id } });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    if (item.userId !== user.userId && user.role !== 'ADMIN') { set.status = 403; return { error: 'Not authorized' }; }
    // Disconnect any doll linked to this chat before deleting
    await prisma.doll.updateMany({ where: { chatId: params.id }, data: { chatId: null } });
    await enqueueDeleted('chat', item);
    return prisma.chat.delete({ where: { id: params.id } });
  });
