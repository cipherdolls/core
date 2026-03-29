-- AlterTable
ALTER TABLE "TtsJob" ADD COLUMN     "ttsVoiceId" TEXT;

-- AddForeignKey
ALTER TABLE "TtsJob" ADD CONSTRAINT "TtsJob_ttsVoiceId_fkey" FOREIGN KEY ("ttsVoiceId") REFERENCES "TtsVoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
