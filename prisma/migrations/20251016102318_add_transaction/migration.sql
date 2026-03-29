-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('stt', 'tts', 'chatCompletion', 'embedding', 'referralRewards', 'scenarioFee', 'platformFee');

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "amountWei" BIGINT NOT NULL,
    "txHash" TEXT,
    "blockNumber" INTEGER,
    "nonce" INTEGER,
    "feeWei" BIGINT,
    "feeFormatted" TEXT,
    "timeTakenMs" INTEGER,
    "error" TEXT,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txHash_key" ON "Transaction"("txHash");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
