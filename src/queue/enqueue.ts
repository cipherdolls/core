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
 * Enqueue a CUD job after a Prisma operation.
 * Call this after create/update/delete in route handlers.
 */
export async function enqueueCreated(queueName: string, entity: any) {
  await getQueue(queueName).add('created', { [queueName]: serializeBigInts(entity) });
}

export async function enqueueUpdated(queueName: string, entity: any, original: any) {
  await getQueue(queueName).add('updated', { [queueName]: serializeBigInts(entity), original: serializeBigInts(original) });
}

export async function enqueueDeleted(queueName: string, entity: any) {
  await getQueue(queueName).add('deleted', { [queueName]: serializeBigInts(entity) });
}
