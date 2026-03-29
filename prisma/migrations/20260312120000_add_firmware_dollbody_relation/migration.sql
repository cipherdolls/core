-- AlterTable
ALTER TABLE "Firmware" ADD COLUMN "dollBodyId" TEXT;

-- Backfill: assign orphan firmwares to a default DollBody if any exist
-- (skip if no firmwares or no dollbodies)
DO $$
DECLARE
  first_body_id TEXT;
BEGIN
  SELECT id INTO first_body_id FROM "DollBody" LIMIT 1;
  IF first_body_id IS NOT NULL THEN
    UPDATE "Firmware" SET "dollBodyId" = first_body_id WHERE "dollBodyId" IS NULL;
  END IF;
END $$;

-- Delete any firmwares that couldn't be backfilled (no DollBody exists)
DELETE FROM "Firmware" WHERE "dollBodyId" IS NULL;

-- Now make the column required
ALTER TABLE "Firmware" ALTER COLUMN "dollBodyId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Firmware" ADD CONSTRAINT "Firmware_dollBodyId_fkey" FOREIGN KEY ("dollBodyId") REFERENCES "DollBody"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
