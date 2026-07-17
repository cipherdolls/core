import type { Job } from 'bullmq';
import { Prisma, type Group } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { redisConnection } from '../queue/connection';
import { enqueueGroupCover } from '../tti/groupCover';

const scalarFields = Object.values(Prisma.GroupScalarFieldEnum) as Prisma.GroupScalarFieldEnum[];

type GroupWithMembers = Group & { avatars?: { id: string }[] };

class GroupsProcessor extends BaseProcessor<Group> {
  constructor() {
    super('group', scalarFields);
  }

  // Created with members → generate the cover from their appearances.
  protected override async onCreated(_job: Job, group: Group): Promise<void> {
    const members = (group as GroupWithMembers).avatars;
    if (!members?.length) return;
    await this.enqueueCover(group, 'Created with members');
  }

  // Membership is a many-to-many relation, invisible to the scalar field diff —
  // compare the avatar id sets of the updated entity and the original snapshot.
  protected override async handleUpdated(job: Job): Promise<void> {
    await super.handleUpdated(job);

    const group = job.data.group as GroupWithMembers;
    const original = job.data.original as GroupWithMembers | undefined;
    if (!group?.avatars || !original?.avatars) return;

    const now = group.avatars.map((a) => a.id).sort().join(',');
    const before = original.avatars.map((a) => a.id).sort().join(',');
    if (now !== before) {
      await this.enqueueCover(group, 'Membership changed');
    }
  }

  /** Claimed atomically so the 2 worker replicas enqueue once per update. */
  private async enqueueCover(group: Group, reason: string): Promise<void> {
    const stamp = new Date(group.updatedAt).getTime();
    const claimed = await redisConnection.set(`group:cover:${group.id}:${stamp}`, '1', 'EX', 300, 'NX');
    if (!claimed) return;
    console.log(`[group] ${reason} on ${group.id} — enqueueing cover generation`);
    await enqueueGroupCover(group.id).catch((e) => console.error(`[group] cover enqueue failed:`, e.message));
  }
}

export const groupsProcessor = new GroupsProcessor();
