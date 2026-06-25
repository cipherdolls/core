import { Prisma, type Character } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';

const scalarFields = Object.values(Prisma.CharacterScalarFieldEnum) as Prisma.CharacterScalarFieldEnum[];

class CharactersProcessor extends BaseProcessor<Character> {
  constructor() {
    super('character', scalarFields);
  }

  protected override getTargets(entity: Character) {
    return { userId: entity.userId };
  }
}

export const charactersProcessor = new CharactersProcessor();
