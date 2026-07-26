CREATE OR REPLACE FUNCTION enforce_active_parent_references()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'customers' AND NEW.parent_customer_id IS NOT NULL THEN
    PERFORM 1 FROM customers
    WHERE id = NEW.parent_customer_id
      AND deleted_at IS NULL
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'parent customer must be active' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'products' AND NEW.customer_id IS NOT NULL THEN
    PERFORM 1 FROM customers
    WHERE id = NEW.customer_id
      AND deleted_at IS NULL
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'product customer must be active' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'projects' THEN
    PERFORM 1 FROM customers
    WHERE id = NEW.customer_id
      AND deleted_at IS NULL
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'project customer must be active' USING ERRCODE = '23514';
    END IF;

    IF NEW.product_id IS NOT NULL THEN
      PERFORM 1 FROM products
      WHERE id = NEW.product_id
        AND deleted_at IS NULL
      FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'project product must be active' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('domains', 'billing_schedules', 'invoices') THEN
    IF NEW.customer_id IS NOT NULL THEN
      PERFORM 1 FROM customers
      WHERE id = NEW.customer_id
        AND deleted_at IS NULL
      FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION '% customer must be active', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;
    END IF;

    IF NEW.project_id IS NOT NULL THEN
      PERFORM 1 FROM projects
      WHERE id = NEW.project_id
        AND deleted_at IS NULL
      FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION '% project must be active', TG_TABLE_NAME
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'licenses' THEN
    PERFORM 1 FROM projects
    WHERE id = NEW.project_id
      AND deleted_at IS NULL
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'license project must be active' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'project_server' THEN
    PERFORM 1 FROM projects
    WHERE id = NEW.project_id
      AND deleted_at IS NULL
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'server link project must be active' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER customers_active_parent_guard
BEFORE INSERT OR UPDATE OF parent_customer_id ON customers
FOR EACH ROW EXECUTE FUNCTION enforce_active_parent_references();

CREATE TRIGGER products_active_parent_guard
BEFORE INSERT OR UPDATE OF customer_id ON products
FOR EACH ROW EXECUTE FUNCTION enforce_active_parent_references();

CREATE TRIGGER projects_active_parent_guard
BEFORE INSERT OR UPDATE OF customer_id, product_id ON projects
FOR EACH ROW EXECUTE FUNCTION enforce_active_parent_references();

CREATE TRIGGER domains_active_parent_guard
BEFORE INSERT OR UPDATE OF customer_id, project_id ON domains
FOR EACH ROW EXECUTE FUNCTION enforce_active_parent_references();

CREATE TRIGGER billing_schedules_active_parent_guard
BEFORE INSERT OR UPDATE OF customer_id, project_id ON billing_schedules
FOR EACH ROW EXECUTE FUNCTION enforce_active_parent_references();

CREATE TRIGGER invoices_active_parent_guard
BEFORE INSERT OR UPDATE OF customer_id, project_id ON invoices
FOR EACH ROW EXECUTE FUNCTION enforce_active_parent_references();

CREATE TRIGGER licenses_active_parent_guard
BEFORE INSERT OR UPDATE OF project_id ON licenses
FOR EACH ROW EXECUTE FUNCTION enforce_active_parent_references();

CREATE TRIGGER project_server_active_parent_guard
BEFORE INSERT OR UPDATE OF project_id ON project_server
FOR EACH ROW EXECUTE FUNCTION enforce_active_parent_references();

ALTER TABLE billing_schedules
  ADD CONSTRAINT billing_schedules_amount_positive_chk
    CHECK (amount > 0) NOT VALID,
  ADD CONSTRAINT billing_schedules_tax_rate_chk
    CHECK (tax_rate >= 0 AND tax_rate <= 100) NOT VALID,
  ADD CONSTRAINT billing_schedules_interval_count_chk
    CHECK (interval_count >= 1 AND interval_count <= 120) NOT VALID,
  ADD CONSTRAINT billing_schedules_due_days_chk
    CHECK (due_days >= 0 AND due_days <= 365) NOT VALID;
