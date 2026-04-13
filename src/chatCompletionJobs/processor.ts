import type { Job } from 'bullmq';
import { Prisma, type ChatCompletionJob } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ethers } from 'ethers';
import { BaseProcessor } from '../queue/processor';
import { prisma, model } from '../db';
import { chatCompletion } from '../llm/completion';
import { rebuildChatHistory } from '../llm/chatHistory';
import { retrieveRagContext, formatRagContext } from '../llm/rag';
import { buildAndCacheSystemPrompt } from '../chats/systemPrompt';

const MASTER_WALLET_ADDRESS = process.env.MASTER_WALLET_ADDRESS!;

const scalarFields = Object.values(Prisma.ChatCompletionJobScalarFieldEnum) as Prisma.ChatCompletionJobScalarFieldEnum[];

function usdToUsdc(usd: Decimal | number): bigint {
  const d = new Decimal(usd.toString());
  return BigInt(d.mul(1_000_000).toFixed(0));
}

class ChatCompletionJobsProcessor extends BaseProcessor<ChatCompletionJob> {
  constructor() {
    super('chatCompletionJob', scalarFields);
  }

  protected override async getTargets(entity: ChatCompletionJob) {
    const chat = await prisma.chat.findUnique({ where: { id: entity.chatId } });
    return { chatId: entity.chatId, userId: chat?.userId };
  }

  protected override async onCreated(_job: Job, ccJob: ChatCompletionJob): Promise<void> {
    const startTime = Date.now();

    try {
      const chat = await prisma.chat.findUnique({
        where: { id: ccJob.chatId },
        include: {
          scenario: { include: { chatModel: { include: { aiProvider: true } } } },
          user: true,
        },
      });
      if (!chat) throw new Error('Chat not found');

      // Call LLM (chat history is fetched inside chatCompletion)
      const result = await chatCompletion(chat as any);

      // Calculate cost
      const chatModel = chat.scenario.chatModel;
      const inputCost = new Decimal(result.inputTokens).mul(chatModel.dollarPerInputToken);
      const outputCost = new Decimal(result.outputTokens).mul(chatModel.dollarPerOutputToken);
      const usdCost = inputCost.add(outputCost);

      // Create ASSISTANT message
      const assistantMessage = await model.message.create({
        data: {
          role: 'ASSISTANT',
          content: result.content,
          chat: { connect: { id: chat.id } },
          user: { connect: { id: chat.userId } },
        },
      });

      // Update chatCompletionJob with metrics (triggers usdCost field handler)
      await model.chatCompletionJob.update({
        where: { id: ccJob.id },
        data: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          usdCost,
          timeTakenMs: Date.now() - startTime,
          message: { connect: { id: assistantMessage.id } },
          chatModel: { connect: { id: chatModel.id } },
        },
      }, ccJob);

      // Create transactions if cost > 0
      await this.createTransactions(chat, assistantMessage.id, usdCost);

      // Rebuild chat history cache from DB now that the assistant message is persisted
      await rebuildChatHistory(chat.id);

      // RAG: retrieve context for the latest user message and bake it into the cached system prompt
      // This runs *after* the LLM call so it doesn't add latency to the current response.
      // The updated prompt will be ready for the next chat completion.
      try {
        const lastUserMsg = await prisma.message.findFirst({
          where: { chatId: chat.id, role: 'USER' },
          orderBy: { createdAt: 'desc' },
        });
        if (lastUserMsg?.content) {
          const ragChunks = await retrieveRagContext(chat.scenarioId, lastUserMsg.content);
          const ragContext = formatRagContext(ragChunks);
          if (ragContext) {
            const basePrompt = await buildAndCacheSystemPrompt(chat.id);
            const { redisConnection } = await import('../queue/connection');
            await redisConnection.set(
              `chatSystemPrompt:${chat.id}`,
              basePrompt + ragContext,
              'EX', 60 * 60,
            );
            console.log(`[chatCompletionJob] RAG: injected ${ragChunks.length} chunks into system prompt`);
          }
        }
      } catch (err: any) {
        console.error(`[chatCompletionJob] RAG retrieval failed (non-blocking): ${err.message}`);
      }

      console.log(`[chatCompletionJob] Completed: ${result.totalTokens} tokens, $${usdCost.toFixed(6)}`);
    } catch (error: any) {
      console.error(`[chatCompletionJob] Failed:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
      await prisma.chatCompletionJob.update({
        where: { id: ccJob.id },
        data: { error: error.message, timeTakenMs: Date.now() - startTime },
      });
    }
  }

  private async createTransactions(chat: any, messageId: string, usdCost: Decimal): Promise<void> {
    const scenario = chat.scenario;
    const scenarioFee = new Decimal(scenario.dollarPerMessage);

    if (usdCost.eq(0) && scenarioFee.eq(0)) return;

    // Determine who pays (sponsor or user)
    const sponsorship = await prisma.sponsorship.findFirst({ where: { scenarioId: scenario.id } });
    const payer = sponsorship
      ? await prisma.user.findUnique({ where: { id: sponsorship.userId } })
      : chat.user;
    if (!payer) return;

    const fromAddress = payer.signerAddress;
    const aiProvider = scenario.chatModel?.aiProvider;
    const aiProviderUser = aiProvider ? await prisma.user.findUnique({ where: { id: aiProvider.userId } }) : null;

    // ChatCompletion transaction
    if (!usdCost.eq(0) && aiProviderUser && fromAddress !== aiProviderUser.signerAddress) {
      await model.transaction.create({
        data: {
          type: 'chatCompletion',
          fromAddress,
          toAddress: aiProviderUser.signerAddress,
          amountWei: usdToUsdc(usdCost),
          message: { connect: { id: messageId } },
        },
      });
    }

    // Scenario fee transaction
    if (!scenarioFee.eq(0) && fromAddress !== MASTER_WALLET_ADDRESS) {
      await model.transaction.create({
        data: {
          type: 'scenarioFee',
          fromAddress,
          toAddress: MASTER_WALLET_ADDRESS,
          amountWei: usdToUsdc(scenarioFee),
          message: { connect: { id: messageId } },
        },
      });
    }
  }
}

export const chatCompletionJobsProcessor = new ChatCompletionJobsProcessor();
