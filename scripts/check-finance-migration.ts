import { prisma } from "../src/lib/db/prisma";

async function main() {
  const duplicatePeriods = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM (
      SELECT billing_schedule_id, period_start
      FROM invoices
      WHERE billing_schedule_id IS NOT NULL
        AND period_start IS NOT NULL
      GROUP BY billing_schedule_id, period_start
      HAVING COUNT(*) > 1
    ) duplicates
  `;
  const invalidTotals = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM invoices
    WHERE NOT (
      total >= 0
      AND paid_total >= 0
      AND balance_due >= 0
      AND (
        (
          status = 'void'
          AND paid_total = 0
          AND balance_due = 0
        )
        OR
        (
          status <> 'void'
          AND paid_total <= total
          AND balance_due = total - paid_total
        )
      )
    )
  `;
  const ownerlessWorkspaces = await prisma.$queryRaw<
    Array<{ count: bigint }>
  >`
    SELECT COUNT(*)::bigint AS count
    FROM workspaces workspace
    WHERE NOT EXISTS (
      SELECT 1
      FROM workspace_user membership
      WHERE membership.workspace_id = workspace.id
        AND membership.role = 'owner'
        AND membership.status = 'active'
    )
  `;

  const result = {
    duplicateSchedulePeriods: Number(duplicatePeriods[0]?.count ?? 0),
    invalidInvoiceTotals: Number(invalidTotals[0]?.count ?? 0),
    ownerlessWorkspaces: Number(ownerlessWorkspaces[0]?.count ?? 0),
  };
  console.log(JSON.stringify(result));

  if (Object.values(result).some((count) => count > 0)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Finans migration önkontrolü başarısız:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
