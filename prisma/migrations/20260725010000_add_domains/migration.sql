-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('active', 'expired', 'transferred', 'cancelled');

-- CreateTable
CREATE TABLE "domains" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "customer_id" UUID,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "registrar" TEXT,
    "registrar_url" TEXT,
    "status" "DomainStatus" NOT NULL DEFAULT 'active',
    "registered_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "ssl_expires_at" TIMESTAMP(3),
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "nameservers" TEXT,
    "annual_cost" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "domains_workspace_id_idx" ON "domains"("workspace_id");

-- CreateIndex
CREATE INDEX "domains_workspace_id_status_idx" ON "domains"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "domains_workspace_id_expires_at_idx" ON "domains"("workspace_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "domains_workspace_id_normalized_name_key" ON "domains"("workspace_id", "normalized_name");

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
