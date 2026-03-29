-- AlterTable
ALTER TABLE "SttJob" ADD COLUMN     "sttProviderId" TEXT;

-- AddForeignKey
ALTER TABLE "SttJob" ADD CONSTRAINT "SttJob_sttProviderId_fkey" FOREIGN KEY ("sttProviderId") REFERENCES "SttProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
