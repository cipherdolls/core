-- AlterTable
ALTER TABLE "Firmware" ADD COLUMN     "bootloader" TEXT,
ADD COLUMN     "bootloaderChecksum" TEXT,
ADD COLUMN     "firmware" TEXT,
ADD COLUMN     "firmwareChecksum" TEXT,
ADD COLUMN     "partition" TEXT,
ADD COLUMN     "partitionChecksum" TEXT;
