-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "manual_fx_rate" DECIMAL(18,6);

-- AlterTable
ALTER TABLE "billing_schedules" ADD COLUMN     "manual_fx_rate" DECIMAL(18,6);

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "manual_fx_rate" DECIMAL(18,6);
