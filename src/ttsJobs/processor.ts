import type { Job } from 'bullmq';
import { Prisma, type TtsJob } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';
import { tts } from '../tts/tts.helper';
import { publishTtsStart, publishTtsChunk, publishTtsEnd, publishTtsError } from '../redisPubSub/redisPubSub';

const ASSETS_PATH = process.env.ASSETS_PATH ?? '/app/uploads';
const MASTER_WALLET_ADDRESS = process.env.MASTER_WALLET_ADDRESS!;

function usdToUsdc(usd: Decimal | number): bigint {
  const d = new Decimal(usd.toString());
  return BigInt(d.mul(1_000_000).toFixed(0));
}

const scalarFields = Object.values(Prisma.TtsJobScalarFieldEnum) as Prisma.TtsJobScalarFieldEnum[];

class TtsJobsProcessor extends BaseProcessor<TtsJob> {
  constructor() {
    super('ttsJob', scalarFields);
  }

  protected override async getTargets(entity: TtsJob) {
    const message = await prisma.message.findUnique({ where: { id: entity.messageId }, include: { chat: true } });
    return { userId: message?.chat?.userId, chatId: message?.chatId };
  }

  protected override async onCreated(_job: Job, ttsJob: TtsJob): Promise<void> {
    const startTime = Date.now();
    const message = await prisma.message.findUnique({
      where: { id: ttsJob.messageId },
      include: { chat: { include: { avatar: { include: { ttsVoice: { include: { ttsProvider: true } } } } } } },
    });
    if (!message?.content || !message.chat?.avatar?.ttsVoice) return;

    try {
      const voice = message.chat.avatar.ttsVoice;
      const provider = voice.ttsProvider;

      publishTtsStart(message.chatId, message.id);
      const result = await tts(message.content, voice, provider, `${ASSETS_PATH}/messages`, {
        onChunk: (chunk: Buffer) => {
          publishTtsChunk(message.chatId, chunk);
        },
      });
      publishTtsEnd(message.chatId, message.id);

      // Update message as completed (no file saved when streaming)
      await model.message.update({
        where: { id: message.id },
        data: { completed: true },
      }, message);

      // Update TTS job with metrics (triggers usdCost field handler)
      const usdCost = new Decimal(result.usdCost);
      await model.ttsJob.update({
        where: { id: ttsJob.id },
        data: {
          characters: result.characters,
          usdCost,
          timeTakenMs: Date.now() - startTime,
          ttsVoice: { connect: { id: voice.id } },
        },
      }, ttsJob);

      // Create TTS transaction if cost > 0
      if (!usdCost.eq(0)) {
        await this.createTtsTransaction(message, usdCost);
      }

      console.log(`[ttsJob] Completed: ${result.characters} chars, $${usdCost.toFixed(6)}`);
    } catch (error: any) {
      publishTtsError(message.chatId, message.id, error.message ?? String(error));
      console.error(`[ttsJob] Failed: ${error.message}`);
      await prisma.ttsJob.update({
        where: { id: ttsJob.id },
        data: { error: error.message, timeTakenMs: Date.now() - startTime },
      });
    }
  }

  private async createTtsTransaction(message: any, usdCost: Decimal): Promise<void> {
    const chat = await prisma.chat.findUnique({
      where: { id: message.chatId },
      include: { user: true, scenario: true, avatar: { include: { ttsVoice: { include: { ttsProvider: { include: { user: true } } } } } } },
    });
    if (!chat) return;

    const sponsorship = await prisma.sponsorship.findFirst({ where: { scenarioId: chat.scenarioId } });
    const payer = sponsorship
      ? await prisma.user.findUnique({ where: { id: sponsorship.userId } })
      : chat.user;
    if (!payer) return;

    const ttsProviderUser = chat.avatar?.ttsVoice?.ttsProvider?.user;
    if (!ttsProviderUser || payer.signerAddress === ttsProviderUser.signerAddress) return;

    await model.transaction.create({
      data: {
        type: 'tts',
        fromAddress: payer.signerAddress,
        toAddress: ttsProviderUser.signerAddress,
        amountWei: usdToUsdc(usdCost),
        message: { connect: { id: message.id } },
      },
    });
  }
}

export const ttsJobsProcessor = new TtsJobsProcessor();
