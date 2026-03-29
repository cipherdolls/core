-- CreateEnum
CREATE TYPE "TransactionJobAction" AS ENUM ('Send', 'Nothing');

-- CreateEnum
CREATE TYPE "TransactionLegType" AS ENUM ('stt', 'tts', 'chatCompletion', 'embedding', 'referralRewards', 'scenarioFee', 'platformFee');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'active', 'completed', 'failed');

-- CreateTable
CREATE TABLE "TransactionJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "action" "TransactionJobAction",
    "error" TEXT,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "TransactionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionLeg" (
    "id" TEXT NOT NULL,
    "transactionJobId" TEXT NOT NULL,
    "type" "TransactionLegType" NOT NULL,
    "to" TEXT NOT NULL,
    "amountWei" BIGINT NOT NULL,
    "txHash" TEXT,
    "blockNumber" INTEGER,
    "nonce" INTEGER,
    "feeWei" BIGINT,
    "feeFormatted" TEXT,
    "timeTakenMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionLeg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransactionJob_messageId_key" ON "TransactionJob"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionLeg_txHash_key" ON "TransactionLeg"("txHash");

-- CreateIndex
CREATE INDEX "TransactionLeg_transactionJobId_idx" ON "TransactionLeg"("transactionJobId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionLeg_transactionJobId_type_key" ON "TransactionLeg"("transactionJobId", "type");

-- AddForeignKey
ALTER TABLE "TransactionJob" ADD CONSTRAINT "TransactionJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLeg" ADD CONSTRAINT "TransactionLeg_transactionJobId_fkey" FOREIGN KEY ("transactionJobId") REFERENCES "TransactionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
