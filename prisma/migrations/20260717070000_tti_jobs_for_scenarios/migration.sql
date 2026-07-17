-- TTI jobs can also target scenarios: the scenario's own chat model distills
-- its systemMessage into a visual scene, which is rendered as the scenario
-- picture. Exactly one of avatarId/groupId/scenarioId is set per job.
ALTER TABLE "TtiJob" ADD COLUMN "scenarioId" TEXT;
ALTER TABLE "TtiJob" ADD CONSTRAINT "TtiJob_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
