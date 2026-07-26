import { prisma } from "../src/lib/db/prisma";

async function main() {
  const violations = await prisma.$queryRaw<
    Array<{ relation: string; count: bigint }>
  >`
    SELECT 'products.customer' AS relation, COUNT(*)::bigint AS count
    FROM products child
    JOIN customers parent ON parent.id = child.customer_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'projects.customer', COUNT(*)::bigint
    FROM projects child
    JOIN customers parent ON parent.id = child.customer_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'projects.product', COUNT(*)::bigint
    FROM projects child
    JOIN products parent ON parent.id = child.product_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'projects.source', COUNT(*)::bigint
    FROM projects child
    JOIN projects parent ON parent.id = child.source_project_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'projects.owner', COUNT(*)::bigint
    FROM projects child
    WHERE child.owner_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM workspace_user membership
        WHERE membership.workspace_id = child.workspace_id
          AND membership.user_id = child.owner_user_id
      )
    UNION ALL
    SELECT 'domains.customer', COUNT(*)::bigint
    FROM domains child
    JOIN customers parent ON parent.id = child.customer_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'domains.project', COUNT(*)::bigint
    FROM domains child
    JOIN projects parent ON parent.id = child.project_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'billing_schedules.customer', COUNT(*)::bigint
    FROM billing_schedules child
    JOIN customers parent ON parent.id = child.customer_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'billing_schedules.project', COUNT(*)::bigint
    FROM billing_schedules child
    JOIN projects parent ON parent.id = child.project_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'invoices.customer', COUNT(*)::bigint
    FROM invoices child
    JOIN customers parent ON parent.id = child.customer_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'invoices.project', COUNT(*)::bigint
    FROM invoices child
    JOIN projects parent ON parent.id = child.project_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'invoices.schedule', COUNT(*)::bigint
    FROM invoices child
    JOIN billing_schedules parent ON parent.id = child.billing_schedule_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'payments.customer', COUNT(*)::bigint
    FROM payments child
    JOIN customers parent ON parent.id = child.customer_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'payments.invoice', COUNT(*)::bigint
    FROM payments child
    JOIN invoices parent ON parent.id = child.invoice_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'licenses.project', COUNT(*)::bigint
    FROM licenses child
    JOIN projects parent ON parent.id = child.project_id
    WHERE child.workspace_id <> parent.workspace_id
    UNION ALL
    SELECT 'webhook_deliveries.project', COUNT(*)::bigint
    FROM webhook_deliveries child
    JOIN projects parent ON parent.id = child.project_id
    WHERE child.workspace_id <> parent.workspace_id
  `;

  const result = Object.fromEntries(
    violations.map((row) => [row.relation, Number(row.count)])
  );
  console.log(JSON.stringify(result));
  if (violations.some((row) => row.count > BigInt(0))) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Tenant migration önkontrolü başarısız:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
