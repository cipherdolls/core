-- CreateTable
CREATE TABLE "ReasoningModel" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dollarPerInputToken" DECIMAL(19,9) NOT NULL DEFAULT 0,
    "dollarPerOutputToken" DECIMAL(19,9) NOT NULL DEFAULT 0,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "providerModelName" TEXT NOT NULL,
    "aiProviderId" TEXT NOT NULL,

    CONSTRAINT "ReasoningModel_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ReasoningModel" ADD CONSTRAINT "ReasoningModel_aiProviderId_fkey" FOREIGN KEY ("aiProviderId") REFERENCES "AiProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
