-- CreateEnum
CREATE TYPE "ChatAction" AS ENUM ('Init', 'RefreshSystemPrompt', 'Summarize', 'Nothing');

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN "action" "ChatAction";
