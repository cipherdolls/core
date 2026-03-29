-- AlterTable
ALTER TABLE "ChatCompletionJob" ALTER COLUMN "usdCost" SET DATA TYPE DECIMAL(19,9);

-- AlterTable
ALTER TABLE "ChatModel" ALTER COLUMN "dollarPerInputToken" SET DATA TYPE DECIMAL(19,9),
ALTER COLUMN "dollarPerOutputToken" SET DATA TYPE DECIMAL(19,9);

-- AlterTable
ALTER TABLE "EmbeddingJob" ALTER COLUMN "usdCost" SET DATA TYPE DECIMAL(19,9);

-- AlterTable
ALTER TABLE "EmbeddingModel" ALTER COLUMN "dollarPerInputToken" SET DATA TYPE DECIMAL(19,9),
ALTER COLUMN "dollarPerOutputToken" SET DATA TYPE DECIMAL(19,9);

-- AlterTable
ALTER TABLE "ExchangeRate" ALTER COLUMN "rate" SET DATA TYPE DECIMAL(19,9);

-- AlterTable
ALTER TABLE "SttJob" ALTER COLUMN "usdCost" SET DATA TYPE DECIMAL(19,9);

-- AlterTable
ALTER TABLE "SttProvider" ALTER COLUMN "dollarPerSecond" SET DATA TYPE DECIMAL(19,9);

-- AlterTable
ALTER TABLE "TtsJob" ALTER COLUMN "usdCost" SET DATA TYPE DECIMAL(19,9);

-- AlterTable
ALTER TABLE "TtsProvider" ALTER COLUMN "dollarPerCharacter" SET DATA TYPE DECIMAL(19,9);
