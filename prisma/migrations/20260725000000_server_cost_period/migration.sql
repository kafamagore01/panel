-- CreateEnum
CREATE TYPE "CostPeriod" AS ENUM ('monthly', 'yearly');

-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "cost_period" "CostPeriod" NOT NULL DEFAULT 'monthly';
