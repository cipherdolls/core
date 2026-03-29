/*
  Warnings:

  - You are about to drop the column `freeWeiBalance` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `privateKeyPart` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `walletAddress` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `weiBalance` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "User_privateKeyPart_key";

-- DropIndex
DROP INDEX "User_walletAddress_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "freeWeiBalance",
DROP COLUMN "privateKeyPart",
DROP COLUMN "walletAddress",
DROP COLUMN "weiBalance";
