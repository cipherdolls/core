-- Image styles as data: admin-curated prompt templates ({subject} placeholder)
-- with composition directives (e.g. eyes at the vertical center, so square
-- center-crops keep the face) and per-style default dimensions.
CREATE TABLE "TtiStyle" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 832,
    "height" INTEGER NOT NULL DEFAULT 1216,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TtiStyle_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TtiStyle" ADD CONSTRAINT "TtiStyle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Doll bodies pick a style; jobs record which style produced each image.
ALTER TABLE "DollBody" ADD COLUMN "ttiStyleId" TEXT;
ALTER TABLE "DollBody" ADD CONSTRAINT "DollBody_ttiStyleId_fkey" FOREIGN KEY ("ttiStyleId") REFERENCES "TtiStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TtiJob" ADD COLUMN "ttiStyleId" TEXT;
ALTER TABLE "TtiJob" ADD CONSTRAINT "TtiJob_ttiStyleId_fkey" FOREIGN KEY ("ttiStyleId") REFERENCES "TtiStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
