import { PrismaClient } from '@prisma/client';
import { createCudService } from './queue/service';

export const prisma = new PrismaClient();

export const model = {
  aiProvider: createCudService('aiProvider', prisma.aiProvider),
  character: createCudService('character', prisma.character),
  chat: createCudService('chat', prisma.chat),
  chatCompletion: createCudService('chatCompletion', prisma.chatCompletion),
  chatModel: createCudService('chatModel', prisma.chatModel),
  message: createCudService('message', prisma.message),
  sttJob: createCudService('sttJob', prisma.sttJob),
  sttProvider: createCudService('sttProvider', prisma.sttProvider),
  ttsJob: createCudService('ttsJob', prisma.ttsJob),
  ttsProvider: createCudService('ttsProvider', prisma.ttsProvider),
  ttsVoice: createCudService('ttsVoice', prisma.ttsVoice),
  picture: createCudService('picture', prisma.picture),
  user: createCudService('user', prisma.user),
};
