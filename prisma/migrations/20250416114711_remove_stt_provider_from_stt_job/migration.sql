/*
  Warnings:

  - You are about to drop the column `sttProviderId` on the `SttJob` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "SttJob" DROP CONSTRAINT "SttJob_sttProviderId_fkey";

-- AlterTable
ALTER TABLE "SttJob" DROP COLUMN "sttProviderId";
