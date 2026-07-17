-- Doll bodies get an owner: always the avatar's creator, so creators manage
-- their avatars' bodies (virtual or physical). Backfill from the avatar.
ALTER TABLE "DollBody" ADD COLUMN "userId" TEXT;

UPDATE "DollBody" SET "userId" = "Avatar"."userId"
FROM "Avatar" WHERE "Avatar"."id" = "DollBody"."avatarId";

ALTER TABLE "DollBody" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "DollBody" ADD CONSTRAINT "DollBody_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
