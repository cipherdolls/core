-- CreateEnum
CREATE TYPE "TtsLanguage" AS ENUM ('en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'zh', 'ko', 'multilingual');

-- AlterTable
ALTER TABLE "TtsVoice" ADD COLUMN     "language" "TtsLanguage";
