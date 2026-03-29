-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('Male', 'Female');

-- AlterTable
ALTER TABLE "Avatar" ADD COLUMN     "gender" "Gender";
