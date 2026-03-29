-- CreateTable
CREATE TABLE "DollBody" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "picture" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DollBody_pkey" PRIMARY KEY ("id")
);
