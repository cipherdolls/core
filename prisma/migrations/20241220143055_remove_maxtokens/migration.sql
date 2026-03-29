/*
  Warnings:

  - You are about to drop the column `maxTokens` on the `ChatModel` table. All the data in the column will be lost.
  - You are about to drop the column `maxTokens` on the `Scenario` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ChatModel" DROP COLUMN "maxTokens";

-- AlterTable
ALTER TABLE "Scenario" DROP COLUMN "maxTokens";
