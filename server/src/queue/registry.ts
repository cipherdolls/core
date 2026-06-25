import { Queue, Worker, type Job, type Processor } from 'bullmq';
import { queueConnection } from './connection';

const defaultOpts = { concurrency: 1 };

const queues = new Map<string, Queue>();
const workers = new Map<string, Worker>();

/** Get or create a named queue */
export function getQueue<T = any>(name: string): Queue<T> {
  if (!queues.has(name)) {
    queues.set(name, new Queue(name, { connection: queueConnection }));
  }
  return queues.get(name)! as Queue<T>;
}

/** Register a worker for a named queue. Call once at startup. */
export function registerWorker<T = any>(
  name: string,
  handler: Processor<T>,
  opts?: { concurrency?: number },
): Worker<T> {
  const worker = new Worker<T>(name, handler, {
    connection: queueConnection,
    concurrency: opts?.concurrency ?? defaultOpts.concurrency,
    autorun: true,
  });

  worker.on('failed', (job: Job<T> | undefined, err: Error) => {
    console.error(`[${name}] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  worker.on('completed', (job: Job<T>) => {
    console.log(`[${name}] Job ${job.id} (${job.name}) completed`);
  });

  workers.set(name, worker);
  return worker;
}

/** Graceful shutdown — close all queues and workers */
export async function closeAll() {
  for (const w of workers.values()) await w.close();
  for (const q of queues.values()) await q.close();
}
