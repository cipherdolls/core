import { Body } from '../helpers/schema';
import { Elysia, t } from 'elysia';
import { prisma, model } from '../db';
import { jwtGuard } from '../auth/jwt';
import { requireAdmin } from '../helpers/admin';
import { parsePagination, paginationMeta } from '../helpers/pagination';

export const firmwaresRoutes = new Elysia({ prefix: '/firmwares' })
  .use(jwtGuard)

  /* ── GET /firmwares ────────────────────────────────────────────── */
  .get('/', async ({ query }) => {
    const { pageNum, take, skip } = parsePagination(query.page, query.limit);

    const [items, total] = await prisma.$transaction([
      prisma.firmware.findMany({ skip, take, include: { dollBody: true }, orderBy: { createdAt: 'desc' } }),
      prisma.firmware.count(),
    ]);
    return { data: items, meta: paginationMeta(total, pageNum, take) };
  })

  /* ── GET /firmwares/:id ────────────────────────────────────────── */
  .get('/:id', async ({ params, set }) => {
    const item = await prisma.firmware.findUnique({
      where: { id: params.id },
      include: { dollBody: true },
    });
    if (!item) { set.status = 404; return { error: 'Not found' }; }
    return item;
  })

  /* ── POST /firmwares ───────────────────────────────────────────── */
  .post(
    '/',
    async ({ user, body, set }) => {
      requireAdmin(user, set);
      return model.firmware.create({
        data: {
          version: body.version,
          dollBody: { connect: { id: body.dollBodyId } },
          bin: body.bin,
          checksum: body.checksum,
          ...(body.bootloader !== undefined ? { bootloader: body.bootloader } : {}),
          ...(body.bootloaderChecksum !== undefined ? { bootloaderChecksum: body.bootloaderChecksum } : {}),
          ...(body.firmware !== undefined ? { firmware: body.firmware } : {}),
          ...(body.firmwareChecksum !== undefined ? { firmwareChecksum: body.firmwareChecksum } : {}),
          ...(body.partition !== undefined ? { partition: body.partition } : {}),
          ...(body.partitionChecksum !== undefined ? { partitionChecksum: body.partitionChecksum } : {}),
        },
      });
    },
    {
      body: Body({
        version: t.String(),
        dollBodyId: t.String(),
        bin: t.String(),
        checksum: t.String(),
        bootloader: t.Optional(t.String()),
        bootloaderChecksum: t.Optional(t.String()),
        firmware: t.Optional(t.String()),
        firmwareChecksum: t.Optional(t.String()),
        partition: t.Optional(t.String()),
        partitionChecksum: t.Optional(t.String()),
      }),
    },
  );
