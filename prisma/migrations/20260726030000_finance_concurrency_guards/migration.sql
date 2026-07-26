-- Billing cron için schedule/periyot başına tek fatura.
ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_billing_schedule_id_period_start_key"
UNIQUE ("billing_schedule_id", "period_start");

-- Ödeme özet alanlarının Payment toplamıyla yürütülen iş kurallarına uygun
-- kalması için temel satır invariant'ları.
ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_payment_totals_check"
CHECK (
  "total" >= 0
  AND "paid_total" >= 0
  AND "balance_due" >= 0
  AND (
    (
      "status" = 'void'
      AND "paid_total" = 0
      AND "balance_due" = 0
    )
    OR
    (
      "status" <> 'void'
      AND "paid_total" <= "total"
      AND "balance_due" = "total" - "paid_total"
    )
  )
);

-- Uygulama dışından veya gelecekteki yeni bir kod yolundan yapılan üyelik
-- değişikliklerinde de her mevcut workspace'in en az bir aktif owner'ı olsun.
CREATE OR REPLACE FUNCTION "serialize_workspace_membership_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_workspace UUID;
  new_workspace UUID;
  target_workspace UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_workspace := OLD.workspace_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_workspace := NEW.workspace_id;
  END IF;

  FOR target_workspace IN
    SELECT DISTINCT candidate
    FROM unnest(ARRAY[old_workspace, new_workspace]) AS candidates(candidate)
    WHERE candidate IS NOT NULL
    ORDER BY candidate
  LOOP
    PERFORM 1
    FROM "workspaces"
    WHERE "id" = target_workspace
    FOR UPDATE;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "serialize_workspace_membership_change"
BEFORE INSERT OR UPDATE OR DELETE ON "workspace_user"
FOR EACH ROW
EXECUTE FUNCTION "serialize_workspace_membership_change"();

CREATE OR REPLACE FUNCTION "enforce_workspace_active_owner"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_workspace UUID;
  new_workspace UUID;
  target_workspace UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_workspace := OLD.workspace_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_workspace := NEW.workspace_id;
  END IF;

  FOR target_workspace IN
    SELECT DISTINCT candidate
    FROM unnest(ARRAY[old_workspace, new_workspace]) AS candidates(candidate)
    WHERE candidate IS NOT NULL
    ORDER BY candidate
  LOOP
    -- Aynı workspace'teki paralel transaction'ları commit aşamasında
    -- seri hale getir. Workspace cascade ile siliniyorsa kontrol uygulanmaz.
    PERFORM 1
    FROM "workspaces"
    WHERE "id" = target_workspace
    FOR UPDATE;

    IF FOUND AND NOT EXISTS (
      SELECT 1
      FROM "workspace_user"
      WHERE "workspace_id" = target_workspace
        AND "role" = 'owner'
        AND "status" = 'active'
    ) THEN
      RAISE EXCEPTION 'workspace_requires_active_owner'
        USING
          ERRCODE = '23514',
          CONSTRAINT = 'workspace_active_owner_required';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "workspace_active_owner_required"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_user"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_workspace_active_owner"();
