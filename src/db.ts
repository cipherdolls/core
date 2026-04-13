import { PrismaClient } from '@prisma/client';
import { createCudService } from './queue/service';

export const prisma = new PrismaClient();

export const model = {
  aiProvider: createCudService('aiProvider', prisma.aiProvider),
  avatar: createCudService('avatar', prisma.avatar),
  chat: createCudService('chat', prisma.chat),
  chatCompletionJob: createCudService('chatCompletionJob', prisma.chatCompletionJob),
  chatModel: createCudService('chatModel', prisma.chatModel),
  doll: createCudService('doll', prisma.doll),
  dollBody: createCudService('dollBody', prisma.dollBody),
  embeddingJob: createCudService('embeddingJob', prisma.embeddingJob),
  embeddingModel: createCudService('embeddingModel', prisma.embeddingModel),
  fillerWord: createCudService('fillerWord', prisma.fillerWord),
  firmware: createCudService('firmware', prisma.firmware),
  knowledgeBase: createCudService('knowledgeBase', prisma.knowledgeBase),
  message: createCudService('message', prisma.message),
  reasoningModel: createCudService('reasoningModel', prisma.reasoningModel),
  scenario: createCudService('scenario', prisma.scenario),
  sponsorship: createCudService('sponsorship', prisma.sponsorship),
  sttJob: createCudService('sttJob', prisma.sttJob),
  sttProvider: createCudService('sttProvider', prisma.sttProvider),
  tokenPermit: createCudService('tokenPermit', prisma.tokenPermit),
  transaction: createCudService('transaction', prisma.transaction),
  ttsJob: createCudService('ttsJob', prisma.ttsJob),
  ttsProvider: createCudService('ttsProvider', prisma.ttsProvider),
  ttsVoice: createCudService('ttsVoice', prisma.ttsVoice),
  picture: createCudService('picture', prisma.picture),
  user: createCudService('user', prisma.user),
};
