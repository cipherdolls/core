-- TTI jobs can also target groups: prompt-driven cover generation (groups have
-- no appearance). Exactly one of avatarId/groupId is set per job.
ALTER TABLE "TtiJob" ALTER COLUMN "avatarId" DROP NOT NULL;
ALTER TABLE "TtiJob" ADD COLUMN "groupId" TEXT;
ALTER TABLE "TtiJob" ADD CONSTRAINT "TtiJob_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
