import type { Job } from 'bullmq';
import { Prisma, type Scenario } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { redisConnection } from '../queue/connection';
import { enqueueScenarioPicture } from '../tti/scene';

const scalarFields = Object.values(Prisma.ScenarioScalarFieldEnum) as Prisma.ScenarioScalarFieldEnum[];

type ScenarioWithAvatars = Scenario & { avatars?: { id: string }[] };

class ScenariosProcessor extends BaseProcessor<Scenario> {
  constructor() {
    super('scenario', scalarFields);
  }

  protected override getTargets(entity: Scenario) {
    return { userId: entity.userId };
  }

  // Created → generate the scenario picture from its scene.
  protected override async onCreated(_job: Job, scenario: Scenario): Promise<void> {
    await this.enqueuePicture(scenario, 'Created');
  }

  protected override getFieldHandlers(_job: Job, scenario: Scenario) {
    return {
      // The scene comes from the systemMessage — regenerate when it changes.
      systemMessage: () => this.enqueuePicture(scenario, 'systemMessage changed'),
    };
  }

  // Avatar membership is many-to-many, invisible to the scalar diff. Regenerate
  // when the avatar set changes — a scenario with exactly one avatar shows that
  // character in the scene, so 1↔many transitions change the picture.
  protected override async handleUpdated(job: Job): Promise<void> {
    await super.handleUpdated(job);

    const scenario = job.data.scenario as ScenarioWithAvatars;
    const original = job.data.original as ScenarioWithAvatars | undefined;
    if (!scenario?.avatars || !original?.avatars) return;

    const now = scenario.avatars.map((a) => a.id).sort().join(',');
    const before = original.avatars.map((a) => a.id).sort().join(',');
    if (now !== before) {
      await this.enqueuePicture(scenario, 'Avatars changed');
    }
  }

  /**
   * Derive the scene (via the scenario's own chat model) and enqueue a picture.
   * Claimed atomically so the 2 worker replicas generate once per change.
   */
  private async enqueuePicture(scenario: Scenario, reason: string): Promise<void> {
    const stamp = new Date(scenario.updatedAt).getTime();
    const claimed = await redisConnection.set(`scenario:tti:${scenario.id}:${stamp}`, '1', 'EX', 300, 'NX');
    if (!claimed) return;
    console.log(`[scenario] ${reason} on ${scenario.id} — deriving scene + enqueueing picture`);
    await enqueueScenarioPicture(scenario.id).catch((e) => console.error('[scenario] picture enqueue failed:', e.message));
  }
}

export const scenariosProcessor = new ScenariosProcessor();
