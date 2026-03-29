import { Prisma, type ChatModel } from '@prisma/client';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';

const scalarFields = Object.values(Prisma.ChatModelScalarFieldEnum) as Prisma.ChatModelScalarFieldEnum[];

class ChatModelsProcessor extends BaseProcessor<ChatModel> {
  constructor() {
    super('chatModel', scalarFields);
  }

  protected override async getTargets(entity: ChatModel) {
    const aiProvider = await prisma.aiProvider.findUnique({ where: { id: entity.aiProviderId } });
    return { userId: aiProvider?.userId };
  }
}

export const chatModelsProcessor = new ChatModelsProcessor();
