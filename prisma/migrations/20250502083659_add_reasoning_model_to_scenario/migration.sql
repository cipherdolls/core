-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "reasoningModelId" TEXT;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_reasoningModelId_fkey" FOREIGN KEY ("reasoningModelId") REFERENCES "ReasoningModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
