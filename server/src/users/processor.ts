import { Prisma, type User } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.UserScalarFieldEnum) as Prisma.UserScalarFieldEnum[];

class UsersProcessor extends BaseProcessor<User> {
  constructor() {
    super('user', scalarFields);
  }

  protected override getTargets(user: User) {
    return { userId: user.id };
  }
}

export const usersProcessor = new UsersProcessor();
