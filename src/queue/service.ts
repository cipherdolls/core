import { getQueue } from './registry';

/** Convert BigInt fields to strings for JSON serialization (BullMQ uses JSON.stringify) */
function serializeBigInts(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInts);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInts(value);
    }
    return result;
  }
  return obj;
}

/**
 * Creates a CUD service for a domain entity.
 *
 * All CUD operations go through this service to ensure:
 * 1. Entity is persisted via Prisma
 * 2. Snapshot is taken (original for updates)
 * 3. Job is enqueued to BullMQ
 *
 * This is the single gateway — never call prisma directly for CUD.
 */
export function createCudService<T>(
  queueName: string,
  prismaDelegate: {
    create: (args: any) => Promise<T>;
    update: (args: any) => Promise<T>;
    delete: (args: any) => Promise<T>;
    findUnique: (args: any) => Promise<T | null>;
  },
) {
  const queue = getQueue(queueName);

  return {
    async create(args: any): Promise<T> {
      const entity = await prismaDelegate.create(args);
      await queue.add('created', { [queueName]: serializeBigInts(entity) });
      return entity;
    },

    async update(args: { where: any; data: any; include?: any }, original?: T): Promise<T> {
      if (!original) {
        original = (await prismaDelegate.findUnique({ where: args.where })) as T;
      }
      const entity = await prismaDelegate.update(args);
      await queue.add('updated', { [queueName]: serializeBigInts(entity), original: serializeBigInts(original) });
      return entity;
    },

    async delete(args: { where: any }): Promise<T> {
      const entity = await prismaDelegate.findUnique({ where: args.where });
      await queue.add('deleted', { [queueName]: serializeBigInts(entity) });
      return prismaDelegate.delete(args);
    },
  };
}
