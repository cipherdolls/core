/*
  Warnings:

  - You are about to drop the `PaymentJob` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TransactionJob` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TransactionLeg` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PaymentJob" DROP CONSTRAINT "PaymentJob_chatCompletionJobId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentJob" DROP CONSTRAINT "PaymentJob_embeddingJobId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentJob" DROP CONSTRAINT "PaymentJob_sttJobId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentJob" DROP CONSTRAINT "PaymentJob_ttsJobId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentJob" DROP CONSTRAINT "PaymentJob_userId_fkey";

-- DropForeignKey
ALTER TABLE "TransactionJob" DROP CONSTRAINT "TransactionJob_messageId_fkey";

-- DropForeignKey
ALTER TABLE "TransactionLeg" DROP CONSTRAINT "TransactionLeg_transactionJobId_fkey";

-- DropTable
DROP TABLE "PaymentJob";

-- DropTable
DROP TABLE "TransactionJob";

-- DropTable
DROP TABLE "TransactionLeg";

-- DropEnum
DROP TYPE "TransactionJobAction";

-- DropEnum
DROP TYPE "TransactionLegType";

-- CreateTable
CREATE TABLE "Audio" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "avatarId" TEXT,
    "fillerWordId" TEXT,
    "ttsVoiceId" TEXT,

    CONSTRAINT "Audio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Audio_avatarId_key" ON "Audio"("avatarId");

-- CreateIndex
CREATE UNIQUE INDEX "Audio_fillerWordId_key" ON "Audio"("fillerWordId");

-- CreateIndex
CREATE UNIQUE INDEX "Audio_ttsVoiceId_key" ON "Audio"("ttsVoiceId");

-- AddForeignKey
ALTER TABLE "Audio" ADD CONSTRAINT "Audio_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audio" ADD CONSTRAINT "Audio_fillerWordId_fkey" FOREIGN KEY ("fillerWordId") REFERENCES "FillerWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audio" ADD CONSTRAINT "Audio_ttsVoiceId_fkey" FOREIGN KEY ("ttsVoiceId") REFERENCES "TtsVoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
