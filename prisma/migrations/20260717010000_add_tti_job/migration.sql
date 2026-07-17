-- Text-to-image jobs: generate a picture for a doll body (appearance-driven).
-- The processor calls the ComfyUI endpoint and attaches the result to the
-- doll body's picture gallery.
CREATE TABLE "TtiJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "prompt" TEXT NOT NULL,
    "seed" INTEGER,
    "width" INTEGER NOT NULL DEFAULT 832,
    "height" INTEGER NOT NULL DEFAULT 1216,
    "usdCost" DECIMAL(19,9) NOT NULL DEFAULT 0,
    "timeTakenMs" INTEGER,
    "error" TEXT,
    "pictureId" TEXT,
    "dollBodyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TtiJob_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TtiJob" ADD CONSTRAINT "TtiJob_dollBodyId_fkey" FOREIGN KEY ("dollBodyId") REFERENCES "DollBody"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TtiJob" ADD CONSTRAINT "TtiJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
