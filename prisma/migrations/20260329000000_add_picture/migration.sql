-- AlterTable
ALTER TABLE "Doll" DROP COLUMN "picture";

-- AlterTable
ALTER TABLE "DollBody" DROP COLUMN "picture";

-- AlterTable
ALTER TABLE "Avatar" DROP COLUMN "picture";

-- AlterTable
ALTER TABLE "Scenario" DROP COLUMN "picture";

-- AlterTable
ALTER TABLE "SttProvider" DROP COLUMN "picture";

-- AlterTable
ALTER TABLE "AiProvider" DROP COLUMN "picture";

-- AlterTable
ALTER TABLE "TtsProvider" DROP COLUMN "picture";

-- CreateTable
CREATE TABLE "Picture" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dollId" TEXT,
    "dollBodyId" TEXT,
    "avatarId" TEXT,
    "scenarioId" TEXT,
    "sttProviderId" TEXT,
    "aiProviderId" TEXT,
    "ttsProviderId" TEXT,

    CONSTRAINT "Picture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Picture_dollId_key" ON "Picture"("dollId");

-- CreateIndex
CREATE UNIQUE INDEX "Picture_dollBodyId_key" ON "Picture"("dollBodyId");

-- CreateIndex
CREATE UNIQUE INDEX "Picture_avatarId_key" ON "Picture"("avatarId");

-- CreateIndex
CREATE UNIQUE INDEX "Picture_scenarioId_key" ON "Picture"("scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Picture_sttProviderId_key" ON "Picture"("sttProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "Picture_aiProviderId_key" ON "Picture"("aiProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "Picture_ttsProviderId_key" ON "Picture"("ttsProviderId");

-- AddForeignKey
ALTER TABLE "Picture" ADD CONSTRAINT "Picture_dollId_fkey" FOREIGN KEY ("dollId") REFERENCES "Doll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Picture" ADD CONSTRAINT "Picture_dollBodyId_fkey" FOREIGN KEY ("dollBodyId") REFERENCES "DollBody"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Picture" ADD CONSTRAINT "Picture_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Picture" ADD CONSTRAINT "Picture_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Picture" ADD CONSTRAINT "Picture_sttProviderId_fkey" FOREIGN KEY ("sttProviderId") REFERENCES "SttProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Picture" ADD CONSTRAINT "Picture_aiProviderId_fkey" FOREIGN KEY ("aiProviderId") REFERENCES "AiProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Picture" ADD CONSTRAINT "Picture_ttsProviderId_fkey" FOREIGN KEY ("ttsProviderId") REFERENCES "TtsProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

