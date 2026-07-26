-- Composite tenant foreign key'lerin referans verebilmesi için parent
-- tablolarda workspace_id + id aday anahtarları.
ALTER TABLE "customers"
ADD CONSTRAINT "customers_workspace_id_id_key" UNIQUE ("workspace_id", "id");

ALTER TABLE "products"
ADD CONSTRAINT "products_workspace_id_id_key" UNIQUE ("workspace_id", "id");

ALTER TABLE "projects"
ADD CONSTRAINT "projects_workspace_id_id_key" UNIQUE ("workspace_id", "id");

ALTER TABLE "licenses"
ADD CONSTRAINT "licenses_workspace_id_id_key" UNIQUE ("workspace_id", "id");

ALTER TABLE "billing_schedules"
ADD CONSTRAINT "billing_schedules_workspace_id_id_key"
UNIQUE ("workspace_id", "id");

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_workspace_id_id_key" UNIQUE ("workspace_id", "id");

-- UUID global olarak geçerli olsa bile ilişki aynı workspace içinde değilse
-- yazım DB tarafından reddedilir.
ALTER TABLE "products"
ADD CONSTRAINT "products_workspace_customer_guard"
FOREIGN KEY ("workspace_id", "customer_id")
REFERENCES "customers" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "projects"
ADD CONSTRAINT "projects_workspace_customer_guard"
FOREIGN KEY ("workspace_id", "customer_id")
REFERENCES "customers" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "projects"
ADD CONSTRAINT "projects_workspace_product_guard"
FOREIGN KEY ("workspace_id", "product_id")
REFERENCES "products" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "domains"
ADD CONSTRAINT "domains_workspace_customer_guard"
FOREIGN KEY ("workspace_id", "customer_id")
REFERENCES "customers" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "domains"
ADD CONSTRAINT "domains_workspace_project_guard"
FOREIGN KEY ("workspace_id", "project_id")
REFERENCES "projects" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "billing_schedules"
ADD CONSTRAINT "billing_schedules_workspace_customer_guard"
FOREIGN KEY ("workspace_id", "customer_id")
REFERENCES "customers" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "billing_schedules"
ADD CONSTRAINT "billing_schedules_workspace_project_guard"
FOREIGN KEY ("workspace_id", "project_id")
REFERENCES "projects" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_workspace_customer_guard"
FOREIGN KEY ("workspace_id", "customer_id")
REFERENCES "customers" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_workspace_project_guard"
FOREIGN KEY ("workspace_id", "project_id")
REFERENCES "projects" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_workspace_schedule_guard"
FOREIGN KEY ("workspace_id", "billing_schedule_id")
REFERENCES "billing_schedules" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "payments"
ADD CONSTRAINT "payments_workspace_customer_guard"
FOREIGN KEY ("workspace_id", "customer_id")
REFERENCES "customers" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "payments"
ADD CONSTRAINT "payments_workspace_invoice_guard"
FOREIGN KEY ("workspace_id", "invoice_id")
REFERENCES "invoices" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "licenses"
ADD CONSTRAINT "licenses_workspace_project_guard"
FOREIGN KEY ("workspace_id", "project_id")
REFERENCES "projects" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "webhook_deliveries"
ADD CONSTRAINT "webhook_deliveries_workspace_project_guard"
FOREIGN KEY ("workspace_id", "project_id")
REFERENCES "projects" ("workspace_id", "id")
ON UPDATE CASCADE ON DELETE RESTRICT;

-- Project'in self-reference ve kullanıcı sahibi doğrudan composite FK ile
-- modellenemiyor: owner workspace_user tablosuna, source ise on-delete SetNull
-- davranışına bağlı. Aynı invariant trigger ile korunur.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "projects" child
    JOIN "projects" source ON source."id" = child."source_project_id"
    WHERE child."workspace_id" <> source."workspace_id"
  ) THEN
    RAISE EXCEPTION 'cross_tenant_project_source_exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "projects" project
    WHERE project."owner_user_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "workspace_user" membership
        WHERE membership."workspace_id" = project."workspace_id"
          AND membership."user_id" = project."owner_user_id"
      )
  ) THEN
    RAISE EXCEPTION 'cross_tenant_project_owner_exists';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "enforce_project_tenant_references"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."source_project_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "projects" source
    WHERE source."id" = NEW."source_project_id"
      AND source."workspace_id" = NEW."workspace_id"
  ) THEN
    RAISE EXCEPTION 'project_source_must_belong_to_workspace'
      USING ERRCODE = '23503';
  END IF;

  IF NEW."owner_user_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "workspace_user" membership
    WHERE membership."workspace_id" = NEW."workspace_id"
      AND membership."user_id" = NEW."owner_user_id"
  ) THEN
    RAISE EXCEPTION 'project_owner_must_belong_to_workspace'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "projects_tenant_reference_guard"
BEFORE INSERT OR UPDATE OF
  "workspace_id", "source_project_id", "owner_user_id"
ON "projects"
FOR EACH ROW
EXECUTE FUNCTION "enforce_project_tenant_references"();
