-- AlterTable
ALTER TABLE "ReasoningModel" ADD COLUMN     "censored" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "contextWindow" INTEGER NOT NULL DEFAULT 0;
