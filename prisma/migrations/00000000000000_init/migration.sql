-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'admin', 'technical', 'finance', 'viewer');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('login', 'enable_2fa', 'disable_2fa');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('company', 'individual');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('lead', 'active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'development', 'testing', 'live', 'maintenance', 'on_hold', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('pending', 'active', 'grace', 'expired', 'suspended', 'revoked');

-- CreateEnum
CREATE TYPE "DomainEnvironment" AS ENUM ('production', 'staging', 'local');

-- CreateEnum
CREATE TYPE "LicenseDomainStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "ActivationStatus" AS ENUM ('active', 'deactivated');

-- CreateEnum
CREATE TYPE "LicenseEventType" AS ENUM ('issued', 'status_changed', 'renewed', 'key_rotated', 'activations_reset', 'validation_failed');

-- CreateEnum
CREATE TYPE "ServerType" AS ENUM ('vds', 'vps', 'hosting', 'dedicated', 'cloud');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('active', 'maintenance', 'suspended', 'terminated');

-- CreateEnum
CREATE TYPE "IntervalUnit" AS ENUM ('month', 'year');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('active', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('issued', 'partial', 'paid', 'overdue', 'void');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('bank_transfer', 'cash', 'credit_card', 'other');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('completed', 'refunded', 'failed');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'delivered', 'failed');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "default_currency" TEXT NOT NULL DEFAULT 'TRY',
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "two_factor_enabled_at" TIMESTAMP(3),
    "two_factor_secret" TEXT,
    "force_password_reset" BOOLEAN NOT NULL DEFAULT false,
    "current_workspace_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_user" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'viewer',
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'company',
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "tax_number" TEXT,
    "tax_office" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website_url" TEXT,
    "billing_address" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'lead',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "repository_url" TEXT,
    "customer_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID,
    "owner_user_id" UUID,
    "code" TEXT NOT NULL,
    "branch_name" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "start_date" TIMESTAMP(3),
    "target_end_date" TIMESTAMP(3),
    "live_at" TIMESTAMP(3),
    "budget" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "live_url" TEXT,
    "admin_url" TEXT,
    "repository_url" TEXT,
    "license_webhook_url" TEXT,
    "license_webhook_secret" TEXT,
    "tech_stack" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "product_name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_secret" TEXT NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'pending',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "grace_ends_at" TIMESTAMP(3),
    "activation_limit" INTEGER NOT NULL DEFAULT 1,
    "auto_suspend" BOOLEAN NOT NULL DEFAULT false,
    "last_validated_at" TIMESTAMP(3),
    "features" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_domains" (
    "id" UUID NOT NULL,
    "license_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "normalized_domain" TEXT NOT NULL,
    "environment" "DomainEnvironment" NOT NULL DEFAULT 'production',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" "LicenseDomainStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_activations" (
    "id" UUID NOT NULL,
    "license_id" UUID NOT NULL,
    "license_domain_id" UUID,
    "instance_id" TEXT NOT NULL,
    "status" "ActivationStatus" NOT NULL DEFAULT 'active',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_ip" TEXT,
    "app_version" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_events" (
    "id" UUID NOT NULL,
    "license_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "type" "LicenseEventType" NOT NULL,
    "previous_status" "LicenseStatus",
    "new_status" "LicenseStatus",
    "reason" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "provider" TEXT,
    "external_ref" TEXT,
    "name" TEXT NOT NULL,
    "type" "ServerType" NOT NULL DEFAULT 'vps',
    "hostname" TEXT,
    "primary_ip" TEXT,
    "region" TEXT,
    "operating_system" TEXT,
    "cpu_cores" INTEGER,
    "ram_mb" INTEGER,
    "disk_gb" INTEGER,
    "management_url" TEXT,
    "ssh_port" INTEGER NOT NULL DEFAULT 22,
    "ssh_user" TEXT,
    "status" "ServerStatus" NOT NULL DEFAULT 'active',
    "renewal_at" TIMESTAMP(3),
    "monthly_cost" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_server" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "role" TEXT,
    "environment" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_schedules" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "project_id" UUID,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    "interval_unit" "IntervalUnit" NOT NULL DEFAULT 'month',
    "interval_count" INTEGER NOT NULL DEFAULT 1,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "next_issue_on" DATE NOT NULL,
    "due_days" INTEGER NOT NULL DEFAULT 7,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'active',
    "last_generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "project_id" UUID,
    "billing_schedule_id" UUID,
    "invoice_no" TEXT NOT NULL,
    "period_start" DATE,
    "period_end" DATE,
    "issued_on" DATE NOT NULL,
    "due_on" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'issued',
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_total" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "paid_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "customer_snapshot" JSONB NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "paid_on" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'bank_transfer',
    "status" "PaymentStatus" NOT NULL DEFAULT 'completed',
    "reference" TEXT,
    "idempotency_key" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "license_id" UUID,
    "idempotency_key" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
    "http_status" INTEGER,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_at" TIMESTAMP(3),
    "response_excerpt" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "auditable_type" TEXT NOT NULL,
    "auditable_id" TEXT,
    "before_data" JSONB,
    "after_data" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "workspace_user_workspace_id_idx" ON "workspace_user"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_user_user_id_idx" ON "workspace_user"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_user_workspace_id_user_id_key" ON "workspace_user"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "otp_codes_user_id_purpose_idx" ON "otp_codes"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "customers_workspace_id_idx" ON "customers"("workspace_id");

-- CreateIndex
CREATE INDEX "customers_workspace_id_status_idx" ON "customers"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "products_workspace_id_idx" ON "products"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_workspace_id_code_key" ON "products"("workspace_id", "code");

-- CreateIndex
CREATE INDEX "projects_workspace_id_idx" ON "projects"("workspace_id");

-- CreateIndex
CREATE INDEX "projects_workspace_id_status_idx" ON "projects"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "projects_customer_id_idx" ON "projects"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspace_id_code_key" ON "projects"("workspace_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "licenses_key_hash_key" ON "licenses"("key_hash");

-- CreateIndex
CREATE INDEX "licenses_workspace_id_idx" ON "licenses"("workspace_id");

-- CreateIndex
CREATE INDEX "licenses_workspace_id_status_idx" ON "licenses"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "licenses_project_id_idx" ON "licenses"("project_id");

-- CreateIndex
CREATE INDEX "license_domains_license_id_idx" ON "license_domains"("license_id");

-- CreateIndex
CREATE UNIQUE INDEX "license_domains_license_id_normalized_domain_environment_key" ON "license_domains"("license_id", "normalized_domain", "environment");

-- CreateIndex
CREATE INDEX "license_activations_license_id_status_idx" ON "license_activations"("license_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "license_activations_license_id_instance_id_key" ON "license_activations"("license_id", "instance_id");

-- CreateIndex
CREATE INDEX "license_events_license_id_type_occurred_at_idx" ON "license_events"("license_id", "type", "occurred_at");

-- CreateIndex
CREATE INDEX "servers_workspace_id_idx" ON "servers"("workspace_id");

-- CreateIndex
CREATE INDEX "servers_workspace_id_status_idx" ON "servers"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "project_server_server_id_idx" ON "project_server"("server_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_server_project_id_server_id_key" ON "project_server"("project_id", "server_id");

-- CreateIndex
CREATE INDEX "billing_schedules_workspace_id_idx" ON "billing_schedules"("workspace_id");

-- CreateIndex
CREATE INDEX "billing_schedules_workspace_id_status_next_issue_on_idx" ON "billing_schedules"("workspace_id", "status", "next_issue_on");

-- CreateIndex
CREATE INDEX "invoices_workspace_id_idx" ON "invoices"("workspace_id");

-- CreateIndex
CREATE INDEX "invoices_workspace_id_status_due_on_idx" ON "invoices"("workspace_id", "status", "due_on");

-- CreateIndex
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_workspace_id_invoice_no_key" ON "invoices"("workspace_id", "invoice_no");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_workspace_id_idx" ON "payments"("workspace_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_idempotency_key_key" ON "webhook_deliveries"("idempotency_key");

-- CreateIndex
CREATE INDEX "webhook_deliveries_workspace_id_status_idx" ON "webhook_deliveries"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_auditable_type_auditable_id_idx" ON "audit_logs"("auditable_type", "auditable_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_current_workspace_id_fkey" FOREIGN KEY ("current_workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_user" ADD CONSTRAINT "workspace_user_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_user" ADD CONSTRAINT "workspace_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_domains" ADD CONSTRAINT "license_domains_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_activations" ADD CONSTRAINT "license_activations_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_activations" ADD CONSTRAINT "license_activations_license_domain_id_fkey" FOREIGN KEY ("license_domain_id") REFERENCES "license_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_events" ADD CONSTRAINT "license_events_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_events" ADD CONSTRAINT "license_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_server" ADD CONSTRAINT "project_server_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_server" ADD CONSTRAINT "project_server_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_schedules" ADD CONSTRAINT "billing_schedules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_schedules" ADD CONSTRAINT "billing_schedules_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_schedules" ADD CONSTRAINT "billing_schedules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_schedule_id_fkey" FOREIGN KEY ("billing_schedule_id") REFERENCES "billing_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
