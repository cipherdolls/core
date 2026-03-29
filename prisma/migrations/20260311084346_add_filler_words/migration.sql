-- DropForeignKey
ALTER TABLE "Scenario" DROP CONSTRAINT "Scenario_embeddingModelId_fkey";

-- CreateTable
CREATE TABLE "FillerWord" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "fileName" TEXT,
    "avatarId" TEXT NOT NULL,

    CONSTRAINT "FillerWord_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FillerWord" ADD CONSTRAINT "FillerWord_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_embeddingModelId_fkey" FOREIGN KEY ("embeddingModelId") REFERENCES "EmbeddingModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
