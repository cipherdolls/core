import { Prisma, type Sponsorship } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.SponsorshipScalarFieldEnum) as Prisma.SponsorshipScalarFieldEnum[];

class SponsorshipsProcessor extends BaseProcessor<Sponsorship> {
  constructor() {
    super('sponsorship', scalarFields);
  }

  protected override getTargets(entity: Sponsorship) {
    return { userId: entity.userId };
  }
}

export const sponsorshipsProcessor = new SponsorshipsProcessor();
