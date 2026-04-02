import { PrismaClient } from '@prisma/client';
import { createCudService } from './queue/service';

export const prisma = new PrismaClient();

export const model = {
  avatar: createCudService('avatar', prisma.avatar),
  chat: createCudService('chat', prisma.chat),
  chatCompletionJob: createCudService('chatCompletionJob', prisma.chatCompletionJob),
  chatModel: createCudService('chatModel', prisma.chatModel),
  doll: createCudService('doll', prisma.doll),
  embeddingJob: createCudService('embeddingJob', prisma.embeddingJob),
  embeddingModel: createCudService('embeddingModel', prisma.embeddingModel),
  fillerWord: createCudService('fillerWord', prisma.fillerWord),
  message: createCudService('message', prisma.message),
  reasoningModel: createCudService('reasoningModel', prisma.reasoningModel),
  scenario: createCudService('scenario', prisma.scenario),
  sponsorship: createCudService('sponsorship', prisma.sponsorship),
  sttJob: createCudService('sttJob', prisma.sttJob),
  tokenPermit: createCudService('tokenPermit', prisma.tokenPermit),
  transaction: createCudService('transaction', prisma.transaction),
  ttsJob: createCudService('ttsJob', prisma.ttsJob),
  ttsProvider: createCudService('ttsProvider', prisma.ttsProvider),
  ttsVoice: createCudService('ttsVoice', prisma.ttsVoice),
  picture: createCudService('picture', prisma.picture),
  user: createCudService('user', prisma.user),
};
