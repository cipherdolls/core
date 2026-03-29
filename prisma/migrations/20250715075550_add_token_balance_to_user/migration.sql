-- CreateEnum
CREATE TYPE "UserAction" AS ENUM ('RefreshTokenBalance');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "action" "UserAction",
ADD COLUMN     "tokenBalance" DECIMAL(19,9) DEFAULT 0;
