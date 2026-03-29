-- CreateEnum
CREATE TYPE "ScenarioType" AS ENUM ('NORMAL', 'ROLEPLAY');

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "type" "ScenarioType" NOT NULL DEFAULT 'NORMAL';
