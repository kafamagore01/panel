import { prisma } from "@/lib/db/prisma";
import {
  computeInvoiceTotals,
  buildCustomerSnapshot,
  addInterval,
} from "@/lib/finance";

const MAX_ITERATIONS = 120;

async function nextInvoiceNo(workspaceId: string, year: number): Promise<string> {
  const prefix = `FT-${year}-`;
  const last = await prisma.invoice.findFirst({
    where: { workspace_id: workspaceId, invoice_no: { startsWith: prefix } },
    orderBy: { invoice_no: "desc" },
    select: { invoice_no: true },
  });
  let seq = 1;
  if (last) {
    const m = last.invoice_no.match(/-(\d+)$/);
    if (m) seq = Number.parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

/**
 * Vadesi gelen aktif planlardan otomatik fatura üretir.
 * - Periyot başına tekilleştirme (period_start eşleşmesi)
 * - Maksimum 120 iterasyon (birikmiş dönemler için)
 * - Müşteri/proje silinmişse plan "paused" yapılır
 */
export async function runBillingCron(): Promise<{
  processed: number;
  generated: number;
  paused: number;
}> {
  const now = new Date();
  const schedules = await prisma.billingSchedule.findMany({
    where: { status: "active", next_issue_on: { lte: now } },
    include: {
      customer: { select: { deleted_at: true } },
      project: { select: { deleted_at: true } },
    },
  });

  let generated = 0;
  let paused = 0;

  for (const schedule of schedules) {
    // Müşteri veya proje silinmişse duraklat
    const customerGone = schedule.customer.deleted_at != null;
    const projectGone = schedule.project ? schedule.project.deleted_at != null : false;
    if (customerGone || projectGone) {
      await prisma.billingSchedule.update({
        where: { id: schedule.id },
        data: { status: "paused" },
      });
      paused++;
      continue;
    }

    const customer = await prisma.customer.findUnique({
      where: { id: schedule.customer_id },
    });
    if (!customer) {
      await prisma.billingSchedule.update({
        where: { id: schedule.id },
        data: { status: "paused" },
      });
      paused++;
      continue;
    }

    let cursor = schedule.next_issue_on;
    let iterations = 0;
    let completed = false;

    while (cursor <= now && iterations < MAX_ITERATIONS) {
      iterations++;

      if (schedule.ends_on && cursor > schedule.ends_on) {
        completed = true;
        break;
      }

      // Tekilleştirme: bu dönem için fatura zaten var mı?
      const existing = await prisma.invoice.findFirst({
        where: { billing_schedule_id: schedule.id, period_start: cursor },
        select: { id: true },
      });

      if (!existing) {
        const { subtotal, tax_total, total } = computeInvoiceTotals(
          Number(schedule.amount),
          Number(schedule.tax_rate)
        );
        const periodEnd = addInterval(cursor, schedule.interval_unit, schedule.interval_count);
        const dueOn = new Date(cursor.getTime() + schedule.due_days * 24 * 60 * 60 * 1000);
        const invoiceNo = await nextInvoiceNo(schedule.workspace_id, cursor.getFullYear());

        await prisma.invoice.create({
          data: {
            workspace_id: schedule.workspace_id,
            customer_id: schedule.customer_id,
            project_id: schedule.project_id,
            billing_schedule_id: schedule.id,
            invoice_no: invoiceNo,
            period_start: cursor,
            period_end: periodEnd,
            issued_on: cursor,
            due_on: dueOn,
            status: "issued",
            currency: schedule.currency,
            // Plandaki sabit kur varsa faturaya taşınır; yoksa güncel TCMB kuru kullanılır
            manual_fx_rate: schedule.manual_fx_rate,
            subtotal,
            tax_total,
            total,
            paid_total: 0,
            balance_due: total,
            description: schedule.title,
            customer_snapshot: buildCustomerSnapshot(customer),
          },
        });
        generated++;
      }

      cursor = addInterval(cursor, schedule.interval_unit, schedule.interval_count);
    }

    if (schedule.ends_on && cursor > schedule.ends_on) completed = true;

    await prisma.billingSchedule.update({
      where: { id: schedule.id },
      data: {
        next_issue_on: cursor,
        last_generated_at: now,
        status: completed ? "completed" : "active",
      },
    });
  }

  return { processed: schedules.length, generated, paused };
}
