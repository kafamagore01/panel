-- enforce_active_parent_references() içindeki tablo ayrımı hatalı kuruluydu.
--
-- `IF TG_TABLE_NAME = 'products' AND NEW.customer_id IS NOT NULL THEN` gibi
-- koşullar PL/pgSQL tarafından TEK bir SQL ifadesi olarak derlenir; soldaki
-- karşılaştırma false olsa bile NEW.<alan> referansı çözümlenmeye çalışılır.
-- Bu yüzden trigger, o kolonu taşımayan bir tabloda çalıştığında
-- 42703 "record \"new\" has no field ..." hatası veriyordu (Prisma: P2022).
-- Örnek: customers tablosuna INSERT -> NEW.customer_id yok -> hata.
--
-- Çözüm: tablo ayrımını dış IF'e, NEW.<alan> referanslarını iç IF'e taşımak.
-- PL/pgSQL ifadeleri yalnızca çalıştırıldıkları dalda derlediği için, her
-- trigger yalnızca kendi tablosunda var olan alanlara dokunur.
-- Guard davranışı (hangi referansın aktif olması gerektiği) değişmemiştir.

CREATE OR REPLACE FUNCTION enforce_active_parent_references()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'customers' THEN
    IF NEW.parent_customer_id IS NOT NULL THEN
      PERFORM 1 FROM customers
      WHERE id = NEW.parent_customer_id
        AND deleted_at IS NULL
      FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'parent customer must be active' USING ERRCODE = '23514';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'products' THEN
    IF NEW.customer_id IS NOT NULL THEN
      PERFORM 1 FROM customers
      WHERE id = NEW.customer_id
        AND deleted_at IS NULL
      FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'product customer must be active' USING ERRCODE = '23514';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'projects' THEN
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

  ELSIF TG_TABLE_NAME IN ('domains', 'billing_schedules', 'invoices') THEN
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

  ELSIF TG_TABLE_NAME = 'licenses' THEN
    PERFORM 1 FROM projects
    WHERE id = NEW.project_id
      AND deleted_at IS NULL
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'license project must be active' USING ERRCODE = '23514';
    END IF;

  ELSIF TG_TABLE_NAME = 'project_server' THEN
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
