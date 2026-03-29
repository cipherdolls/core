/*
  Warnings:

  - You are about to drop the column `from` on the `TransactionLeg` table. All the data in the column will be lost.
  - You are about to drop the column `to` on the `TransactionLeg` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TransactionLeg" DROP COLUMN "from",
DROP COLUMN "to";
