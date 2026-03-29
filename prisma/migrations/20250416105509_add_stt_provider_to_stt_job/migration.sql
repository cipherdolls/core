/*
  Warnings:

  - Added the required column `sttProviderId` to the `SttJob` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SttJob" ADD COLUMN     "sttProviderId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "SttJob" ADD CONSTRAINT "SttJob_sttProviderId_fkey" FOREIGN KEY ("sttProviderId") REFERENCES "SttProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
