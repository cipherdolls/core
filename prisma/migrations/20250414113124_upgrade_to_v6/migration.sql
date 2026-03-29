-- AlterTable
ALTER TABLE "_AvatarToScenario" ADD CONSTRAINT "_AvatarToScenario_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_AvatarToScenario_AB_unique";
