/*
  Warnings:

  - You are about to drop the column `apiKey` on the `TtsProvider` table. All the data in the column will be lost.
  - You are about to drop the column `hostname` on the `TtsProvider` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TtsProvider" DROP COLUMN "apiKey",
DROP COLUMN "hostname";
