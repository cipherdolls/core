-- AlterTable
ALTER TABLE "ChatModel" ADD COLUMN "free" BOOLEAN NOT NULL DEFAULT true;

-- Set free = false for models that have non-zero costs
UPDATE "ChatModel" SET "free" = false WHERE "dollarPerInputToken" > 0 OR "dollarPerOutputToken" > 0;
