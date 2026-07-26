import type { Prisma } from "@/generated/prisma/client";

/**
 * Workspace/yıl çifti için transaction-scoped advisory lock alıp bir sonraki
 * fatura numarasını üretir. Faturanın aynı transaction içinde oluşturulması
 * gerekir; aksi halde kilit numara benzersizliğini korumaz.
 */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  year: number
): Promise<string> {
  const prefix = `FT-${year}-`;
  const lockKey = `invoice-number:${workspaceId}:${year}`;

  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `;

  const rows = await tx.$queryRaw<Array<{ sequence: bigint | number | string }>>`
    SELECT COALESCE(
      MAX((SUBSTRING(invoice_no FROM '[0-9]+$'))::bigint),
      0
    ) AS sequence
    FROM invoices
    WHERE workspace_id = ${workspaceId}::uuid
      AND invoice_no LIKE ${`${prefix}%`}
  `;

  const previous = BigInt(rows[0]?.sequence ?? 0);
  const sequence = previous + BigInt(1);
  return `${prefix}${sequence.toString().padStart(4, "0")}`;
}
