/*
  Warnings:

  - Added the required column `avatarId` to the `DollBody` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DollBody" ADD COLUMN     "avatarId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "DollBody" ADD CONSTRAINT "DollBody_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
