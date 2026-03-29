-- CreateTable
CREATE TABLE "Firmware" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" TEXT NOT NULL,
    "bin" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,

    CONSTRAINT "Firmware_pkey" PRIMARY KEY ("id")
);
