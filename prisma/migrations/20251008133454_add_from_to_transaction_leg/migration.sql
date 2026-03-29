/*
  Warnings:

  - Added the required column `from` to the `TransactionLeg` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TransactionLeg" ADD COLUMN     "from" TEXT NOT NULL;
