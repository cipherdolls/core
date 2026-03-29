-- AlterTable
ALTER TABLE "EmbeddingJob" ADD COLUMN     "embeddingModelId" TEXT;

-- AddForeignKey
ALTER TABLE "EmbeddingJob" ADD CONSTRAINT "EmbeddingJob_embeddingModelId_fkey" FOREIGN KEY ("embeddingModelId") REFERENCES "EmbeddingModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
