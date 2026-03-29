-- DropForeignKey
ALTER TABLE "Chat" DROP CONSTRAINT "Chat_sttProviderId_fkey";

-- AlterTable
ALTER TABLE "Chat" ALTER COLUMN "sttProviderId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_sttProviderId_fkey" FOREIGN KEY ("sttProviderId") REFERENCES "SttProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
