-- CreateEnum
CREATE TYPE "TtsVoiceAction" AS ENUM ('CreateExampleAudio', 'Nothing');

-- AlterTable
ALTER TABLE "TtsProvider" ADD COLUMN "exampleVoiceText" TEXT NOT NULL DEFAULT 'Hello, this is a test.';

-- AlterTable
ALTER TABLE "TtsVoice" ADD COLUMN "action" "TtsVoiceAction";
