import { Prisma, type Group } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.GroupScalarFieldEnum) as Prisma.GroupScalarFieldEnum[];

class GroupsProcessor extends BaseProcessor<Group> {
  constructor() {
    super('group', scalarFields);
  }
}

export const groupsProcessor = new GroupsProcessor();
