-- Correction: doll bodies are PHYSICAL hardware only (real photos, hardware
-- description). The character's look — appearance, style, AI-generated
-- pictures — belongs to the AVATAR. Virtual bodies were a modeling mistake:
-- move their data to the avatars and delete them.

-- 1. Avatar gains appearance + style; pictures become a gallery (1:n).
ALTER TABLE "Avatar" ADD COLUMN "appearance" TEXT;
ALTER TABLE "Avatar" ADD COLUMN "ttiStyleId" TEXT;
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_ttiStyleId_fkey" FOREIGN KEY ("ttiStyleId") REFERENCES "TtiStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX "Picture_avatarId_key";

-- 2. Move appearance + style from each avatar's virtual body to the avatar.
UPDATE "Avatar" a
SET "appearance" = b."appearance", "ttiStyleId" = b."ttiStyleId"
FROM "DollBody" b
WHERE b."avatarId" = a."id" AND b."virtual" = true AND b."appearance" IS NOT NULL;

-- 3. Move generated pictures from virtual-body galleries to avatar galleries.
UPDATE "Picture" p
SET "avatarId" = b."avatarId", "dollBodyId" = NULL
FROM "DollBody" b
WHERE p."dollBodyId" = b."id" AND b."virtual" = true;

-- 4. Retarget TTI jobs from doll bodies to avatars.
ALTER TABLE "TtiJob" ADD COLUMN "avatarId" TEXT;
UPDATE "TtiJob" t SET "avatarId" = b."avatarId" FROM "DollBody" b WHERE t."dollBodyId" = b."id";
DELETE FROM "TtiJob" WHERE "avatarId" IS NULL;
ALTER TABLE "TtiJob" ALTER COLUMN "avatarId" SET NOT NULL;
ALTER TABLE "TtiJob" ADD CONSTRAINT "TtiJob_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TtiJob" DROP COLUMN "dollBodyId";

-- 5. Delete the virtual bodies and drop the misplaced fields.
DELETE FROM "DollBody" WHERE "virtual" = true;
ALTER TABLE "DollBody" DROP COLUMN "appearance";
ALTER TABLE "DollBody" DROP COLUMN "virtual";
ALTER TABLE "DollBody" DROP COLUMN "ttiStyleId";
