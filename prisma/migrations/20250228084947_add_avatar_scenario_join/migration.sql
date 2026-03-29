-- CreateTable
CREATE TABLE "_AvatarToScenario" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_AvatarToScenario_AB_unique" ON "_AvatarToScenario"("A", "B");

-- CreateIndex
CREATE INDEX "_AvatarToScenario_B_index" ON "_AvatarToScenario"("B");

-- AddForeignKey
ALTER TABLE "_AvatarToScenario" ADD CONSTRAINT "_AvatarToScenario_A_fkey" FOREIGN KEY ("A") REFERENCES "Avatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AvatarToScenario" ADD CONSTRAINT "_AvatarToScenario_B_fkey" FOREIGN KEY ("B") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
