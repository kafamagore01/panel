-- AlterTable
ALTER TABLE "customers"
ADD COLUMN "parent_customer_id" UUID,
ADD COLUMN "branch_name" TEXT;

-- CreateIndex
CREATE INDEX "customers_workspace_id_parent_customer_id_idx"
ON "customers"("workspace_id", "parent_customer_id");

-- AddForeignKey
ALTER TABLE "customers"
ADD CONSTRAINT "customers_parent_customer_id_fkey"
FOREIGN KEY ("parent_customer_id") REFERENCES "customers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
