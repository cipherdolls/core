-- DropForeignKey
ALTER TABLE "Sponsorship" DROP CONSTRAINT "Sponsorship_scenarioId_fkey";

-- AddForeignKey
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
