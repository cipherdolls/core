import type { Job } from 'bullmq';
import { isDeepStrictEqual } from 'node:util';
import { publishProcessEvent } from '../mqtt/client';

/**
 * Base processor following the MODULE_GUIDE CUD pattern.
 *
 * Every handler publishes active/completed/failed MQTT status events.
 * Subclasses override handleCreated/handleUpdated/handleDeleted and getFieldHandlers.
 */
export abstract class BaseProcessor<T extends Record<string, any>> {
  constructor(
    protected readonly entityName: string,
    protected readonly scalarFields: readonly string[],
  ) {}

  /** Publish MQTT process event */
  protected publishStatus(
    job: Job,
    targets: { userId?: string; dollId?: string; chatId?: string },
    status: 'active' | 'completed' | 'failed',
    resourceAttributes?: Record<string, any>,
  ) {
    const entity = job.data[this.entityName];
    publishProcessEvent({
      jobName: job.name!,
      jobId: Number(job.id),
      targets,
      resourceName: this.entityName.charAt(0).toUpperCase() + this.entityName.slice(1),
      resourceId: entity?.id ?? '',
      jobStatus: status,
      resourceAttributes,
    });
  }

  /** Get targets for MQTT publishing. Override for custom routing (e.g. dolls → userId + dollId). */
  protected getTargets(entity: T): Promise<{ userId?: string; dollId?: string; chatId?: string }> | { userId?: string; dollId?: string; chatId?: string } {
    return { userId: (entity as any).userId };
  }

  /** Entry point — called by BullMQ worker */
  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'created':
        return this.handleCreated(job);
      case 'updated':
        return this.handleUpdated(job);
      case 'deleted':
        return this.handleDeleted(job);
      default:
        console.warn(`[${this.entityName}] Unknown job name: ${job.name}`);
    }
  }

  protected async handleCreated(job: Job): Promise<void> {
    const entity = job.data[this.entityName] as T;
    const targets = await this.getTargets(entity);
    console.log(`[${this.entityName}] Created ${entity?.id}`);

    try {
      this.publishStatus(job, targets, 'active');
      await this.onCreated(job, entity);
      this.publishStatus(job, targets, 'completed');
    } catch (error: any) {
      console.error(`[${this.entityName}] Error in handleCreated:`, error.message);
      this.publishStatus(job, targets, 'failed');
      throw error;
    }
  }

  protected async handleUpdated(job: Job): Promise<void> {
    const entity = job.data[this.entityName] as T;
    const original = job.data.original as T | undefined;
    const targets = await this.getTargets(entity);

    if (!original) {
      console.warn(`[${this.entityName}] No original for ${entity?.id}, skipping`);
      return;
    }

    const updatedFields = this.scalarFields.filter(
      (key) => !isDeepStrictEqual((original as any)[key], (entity as any)[key]),
    );

    if (updatedFields.length === 0) {
      console.log(`[${this.entityName}] ${entity?.id} updated but no scalar changes`);
      return;
    }

    console.log(`[${this.entityName}] Updated ${entity?.id}. Fields: ${updatedFields.join(', ')}`);

    const resourceAttributes: Record<string, any> = {};
    for (const field of updatedFields) {
      resourceAttributes[field] = (entity as any)[field];
    }

    this.publishStatus(job, targets, 'active', resourceAttributes);

    try {
      const handlers = this.getFieldHandlers(job, entity);
      for (const field of updatedFields) {
        const handler = handlers[field];
        if (handler) await handler();
      }
      this.publishStatus(job, targets, 'completed', resourceAttributes);
    } catch (error: any) {
      console.error(`[${this.entityName}] Error in handleUpdated:`, error.message);
      this.publishStatus(job, targets, 'failed');
    }
  }

  protected async handleDeleted(job: Job): Promise<void> {
    const entity = job.data[this.entityName] as T;
    const targets = await this.getTargets(entity);
    console.log(`[${this.entityName}] Deleted ${entity?.id}`);
    this.publishStatus(job, targets, 'active');
    this.publishStatus(job, targets, 'completed');
  }

  /** Override for custom creation logic */
  protected async onCreated(_job: Job, _entity: T): Promise<void> {}

  /** Return field → handler map for per-field side effects */
  protected getFieldHandlers(_job: Job, _entity: T): Record<string, () => Promise<void>> {
    return {};
  }
}
