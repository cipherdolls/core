/*
  Warnings:

  - Added the required column `dollBodyId` to the `Doll` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Doll" ADD COLUMN     "dollBodyId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Doll" ADD CONSTRAINT "Doll_dollBodyId_fkey" FOREIGN KEY ("dollBodyId") REFERENCES "DollBody"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
