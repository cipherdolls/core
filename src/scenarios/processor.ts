import { Prisma, type Scenario } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.ScenarioScalarFieldEnum) as Prisma.ScenarioScalarFieldEnum[];

class ScenariosProcessor extends BaseProcessor<Scenario> {
  constructor() {
    super('scenario', scalarFields);
  }

  protected override getTargets(entity: Scenario) {
    return { userId: entity.userId };
  }
}

export const scenariosProcessor = new ScenariosProcessor();
