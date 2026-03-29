import type { Job } from 'bullmq';
import { Prisma, type TtsJob } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BaseProcessor } from '../queue/processor';
import { prisma } from '../db';
import { tts } from '../tts/tts.helper';
import { enqueueCreated, enqueueUpdated } from '../queue/enqueue';

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

    try {
      const message = await prisma.message.findUnique({
        where: { id: ttsJob.messageId },
        include: { chat: { include: { avatar: { include: { ttsVoice: { include: { ttsProvider: true } } } } } } },
      });
      if (!message?.content || !message.chat?.avatar?.ttsVoice) return;

      const voice = message.chat.avatar.ttsVoice;
      const provider = voice.ttsProvider;

      const result = await tts(message.content, voice, provider, `${ASSETS_PATH}/messages`);

      // Update message with audio file and enqueue
      const originalMessage = message;
      const updatedMessage = await prisma.message.update({
        where: { id: message.id },
        data: { fileName: result.fileName, completed: true },
      });
      await enqueueUpdated('message', updatedMessage, originalMessage);

      // Update TTS job with metrics and enqueue (triggers usdCost field handler)
      const usdCost = new Decimal(result.usdCost);
      const original = ttsJob;
      const updated = await prisma.ttsJob.update({
        where: { id: ttsJob.id },
        data: {
          characters: result.characters,
          usdCost,
          timeTakenMs: Date.now() - startTime,
          ttsVoice: { connect: { id: voice.id } },
        },
      });
      await enqueueUpdated('ttsJob', updated, original);

      // Create TTS transaction if cost > 0
      if (!usdCost.eq(0)) {
        await this.createTtsTransaction(message, usdCost);
      }

      console.log(`[ttsJob] Completed: ${result.characters} chars, $${usdCost.toFixed(6)}`);
    } catch (error: any) {
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

    const tx = await prisma.transaction.create({
      data: {
        type: 'tts',
        fromAddress: payer.signerAddress,
        toAddress: ttsProviderUser.signerAddress,
        amountWei: usdToUsdc(usdCost),
        message: { connect: { id: message.id } },
      },
    });
    await enqueueCreated('transaction', tx);
  }
}

export const ttsJobsProcessor = new TtsJobsProcessor();
