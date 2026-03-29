-- AlterTable
ALTER TABLE "PaymentJob" ADD COLUMN     "cumulativeGasUsed" BIGINT DEFAULT 0,
ADD COLUMN     "gasPrice" BIGINT DEFAULT 0,
ADD COLUMN     "gasUsed" BIGINT DEFAULT 0;
