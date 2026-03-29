-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('STT', 'LLM', 'TTS');

-- CreateEnum
CREATE TYPE "LanguageCode" AS ENUM ('en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'zh', 'ko');

-- CreateEnum
CREATE TYPE "MessageUserRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apikey" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "name" TEXT NOT NULL DEFAULT 'Adam',
    "character" TEXT NOT NULL DEFAULT '',
    "signerAddress" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "weiBalance" BIGINT DEFAULT 0,
    "privateKeyPart" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Doll" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "macAddress" TEXT NOT NULL,
    "name" TEXT,
    "picture" TEXT,
    "userId" TEXT NOT NULL,
    "chatId" TEXT,

    CONSTRAINT "Doll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "picture" TEXT,
    "name" TEXT NOT NULL,
    "shortDesc" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL DEFAULT 'en',
    "character" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "ttsVoiceId" TEXT NOT NULL,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "systemMessage" TEXT NOT NULL,
    "picture" TEXT,
    "maxTokens" INTEGER,
    "temperature" DOUBLE PRECISION,
    "topP" DOUBLE PRECISION,
    "frequencyPenalty" DOUBLE PRECISION,
    "presencePenalty" DOUBLE PRECISION,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "chatModelId" TEXT NOT NULL,
    "embeddingModelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "avatarId" TEXT NOT NULL,
    "sttProviderId" TEXT NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "MessageUserRole" NOT NULL DEFAULT 'USER',
    "content" TEXT,
    "vector" vector,
    "fileName" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "mood" TEXT,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT,
    "weiCost" BIGINT DEFAULT 0,
    "timeTakenMs" INTEGER,
    "userId" TEXT NOT NULL,
    "chatCompletionJobId" TEXT,
    "embeddingJobId" TEXT,
    "sttJobId" TEXT,
    "ttsJobId" TEXT,

    CONSTRAINT "PaymentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatCompletionJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "usdCost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "timeTakenMs" INTEGER,
    "chatModelId" TEXT,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT,

    CONSTRAINT "ChatCompletionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbeddingJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "usdCost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "timeTakenMs" INTEGER,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "EmbeddingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SttJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "audioSeconds" DOUBLE PRECISION,
    "usdCost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "timeTakenMs" INTEGER,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "SttJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtsJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "characters" INTEGER,
    "usdCost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "timeTakenMs" INTEGER,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "TtsJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SttProvider" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "picture" TEXT,
    "hostName" TEXT,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "dollarPerSecond" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SttProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProvider" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "basePath" TEXT NOT NULL,
    "picture" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatModel" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "providerModelName" TEXT NOT NULL,
    "info" TEXT,
    "dollarPerInputToken" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "dollarPerOutputToken" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "maxTokens" INTEGER NOT NULL,
    "contextWindow" INTEGER NOT NULL DEFAULT 0,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "censored" BOOLEAN NOT NULL DEFAULT true,
    "aiProviderId" TEXT NOT NULL,

    CONSTRAINT "ChatModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbeddingModel" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "aiProviderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerModelName" TEXT NOT NULL,
    "info" TEXT,
    "dollarPerInputToken" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "dollarPerOutputToken" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "recommended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EmbeddingModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtsProvider" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dollarPerCharacter" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "picture" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TtsProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtsVoice" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "providerVoiceId" TEXT NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "ttsProviderId" TEXT NOT NULL,

    CONSTRAINT "TtsVoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_apikey_key" ON "User"("apikey");

-- CreateIndex
CREATE UNIQUE INDEX "User_signerAddress_key" ON "User"("signerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_privateKeyPart_key" ON "User"("privateKeyPart");

-- CreateIndex
CREATE UNIQUE INDEX "Doll_macAddress_key" ON "Doll"("macAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Doll_chatId_key" ON "Doll"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentJob_chatCompletionJobId_key" ON "PaymentJob"("chatCompletionJobId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentJob_embeddingJobId_key" ON "PaymentJob"("embeddingJobId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentJob_sttJobId_key" ON "PaymentJob"("sttJobId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentJob_ttsJobId_key" ON "PaymentJob"("ttsJobId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatCompletionJob_messageId_key" ON "ChatCompletionJob"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "EmbeddingJob_messageId_key" ON "EmbeddingJob"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "SttJob_messageId_key" ON "SttJob"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "TtsJob_messageId_key" ON "TtsJob"("messageId");

-- AddForeignKey
ALTER TABLE "Doll" ADD CONSTRAINT "Doll_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doll" ADD CONSTRAINT "Doll_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_ttsVoiceId_fkey" FOREIGN KEY ("ttsVoiceId") REFERENCES "TtsVoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_chatModelId_fkey" FOREIGN KEY ("chatModelId") REFERENCES "ChatModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_embeddingModelId_fkey" FOREIGN KEY ("embeddingModelId") REFERENCES "EmbeddingModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_sttProviderId_fkey" FOREIGN KEY ("sttProviderId") REFERENCES "SttProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentJob" ADD CONSTRAINT "PaymentJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentJob" ADD CONSTRAINT "PaymentJob_chatCompletionJobId_fkey" FOREIGN KEY ("chatCompletionJobId") REFERENCES "ChatCompletionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentJob" ADD CONSTRAINT "PaymentJob_embeddingJobId_fkey" FOREIGN KEY ("embeddingJobId") REFERENCES "EmbeddingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentJob" ADD CONSTRAINT "PaymentJob_sttJobId_fkey" FOREIGN KEY ("sttJobId") REFERENCES "SttJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentJob" ADD CONSTRAINT "PaymentJob_ttsJobId_fkey" FOREIGN KEY ("ttsJobId") REFERENCES "TtsJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatCompletionJob" ADD CONSTRAINT "ChatCompletionJob_chatModelId_fkey" FOREIGN KEY ("chatModelId") REFERENCES "ChatModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatCompletionJob" ADD CONSTRAINT "ChatCompletionJob_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatCompletionJob" ADD CONSTRAINT "ChatCompletionJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbeddingJob" ADD CONSTRAINT "EmbeddingJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SttJob" ADD CONSTRAINT "SttJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtsJob" ADD CONSTRAINT "TtsJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SttProvider" ADD CONSTRAINT "SttProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProvider" ADD CONSTRAINT "AiProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatModel" ADD CONSTRAINT "ChatModel_aiProviderId_fkey" FOREIGN KEY ("aiProviderId") REFERENCES "AiProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbeddingModel" ADD CONSTRAINT "EmbeddingModel_aiProviderId_fkey" FOREIGN KEY ("aiProviderId") REFERENCES "AiProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtsProvider" ADD CONSTRAINT "TtsProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtsVoice" ADD CONSTRAINT "TtsVoice_ttsProviderId_fkey" FOREIGN KEY ("ttsProviderId") REFERENCES "TtsProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
