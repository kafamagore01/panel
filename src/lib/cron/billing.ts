import { prisma } from "@/lib/db/prisma";
import {
  computeInvoiceTotals,
  buildCustomerSnapshot,
  addInterval,
} from "@/lib/finance";
import { nextInvoiceNumber } from "@/lib/finance/invoice-number";

const MAX_ITERATIONS = 120;
const MAX_SCHEDULES_PER_RUN = 200;
const SCHEDULE_TRANSACTION_TIMEOUT_MS = 30_000;

type ScheduleResult = {
  generated: number;
  paused: boolean;
};

/**
 * Vadesi gelen aktif planlardan otomatik fatura üretir.
 *
 * Her plan satırı transaction boyunca kilitlenir. Böylece paralel cron
 * worker'ları aynı next_issue_on değerini işleyemez. DB'deki
 * (billing_schedule_id, period_start) unique constraint'i de ikinci emniyet
 * katmanıdır.
 */
export async function runBillingCron(): Promise<{
  processed: number;
  generated: number;
  paused: number;
}> {
  const now = new Date();
  const scheduleIds = await prisma.billingSchedule.findMany({
    where: { status: "active", next_issue_on: { lte: now } },
    select: { id: true },
    orderBy: [{ next_issue_on: "asc" }, { id: "asc" }],
    take: MAX_SCHEDULES_PER_RUN,
  });

  let generated = 0;
  let paused = 0;

  for (const { id } of scheduleIds) {
    const result = await prisma.$transaction(
      async (tx): Promise<ScheduleResult> => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM billing_schedules
          WHERE id = ${id}::uuid
          FOR UPDATE
        `;
        if (locked.length === 0) {
          return { generated: 0, paused: false };
        }

        // Kilit beklenirken başka worker planı ilerletmiş olabilir; güncel
        // değerler kilit alındıktan sonra yeniden okunur.
        const schedule = await tx.billingSchedule.findUnique({
          where: { id },
          include: {
            customer: true,
            project: { select: { deleted_at: true } },
          },
        });
        if (
          !schedule ||
          schedule.status !== "active" ||
          schedule.next_issue_on > now
        ) {
          return { generated: 0, paused: false };
        }

        const customerGone = schedule.customer.deleted_at != null;
        const projectGone = schedule.project
          ? schedule.project.deleted_at !== null
          : false;
        if (customerGone || projectGone) {
          await tx.billingSchedule.update({
            where: { id: schedule.id },
            data: { status: "paused" },
          });
          return { generated: 0, paused: true };
        }

        let cursor = schedule.next_issue_on;
        let iterations = 0;
        let completed = false;
        let scheduleGenerated = 0;

        while (cursor <= now && iterations < MAX_ITERATIONS) {
          iterations += 1;

          if (schedule.ends_on && cursor > schedule.ends_on) {
            completed = true;
            break;
          }

          const existing = await tx.invoice.findFirst({
            where: {
              billing_schedule_id: schedule.id,
              period_start: cursor,
            },
            select: { id: true },
          });

          if (!existing) {
            const { subtotal, tax_total, total } = computeInvoiceTotals(
              Number(schedule.amount),
              Number(schedule.tax_rate)
            );
            const periodEnd = addInterval(
              cursor,
              schedule.interval_unit,
              schedule.interval_count
            );
            const dueOn = new Date(
              cursor.getTime() + schedule.due_days * 24 * 60 * 60 * 1000
            );
            const invoiceNo = await nextInvoiceNumber(
              tx,
              schedule.workspace_id,
              cursor.getFullYear()
            );

            await tx.invoice.create({
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
                manual_fx_rate: schedule.manual_fx_rate,
                subtotal,
                tax_total,
                total,
                paid_total: 0,
                balance_due: total,
                description: schedule.title,
                customer_snapshot: buildCustomerSnapshot(schedule.customer),
              },
            });
            scheduleGenerated += 1;
          }

          cursor = addInterval(
            cursor,
            schedule.interval_unit,
            schedule.interval_count
          );
        }

        if (schedule.ends_on && cursor > schedule.ends_on) completed = true;

        await tx.billingSchedule.update({
          where: { id: schedule.id },
          data: {
            next_issue_on: cursor,
            last_generated_at: now,
            status: completed ? "completed" : "active",
          },
        });

        return { generated: scheduleGenerated, paused: false };
      },
      {
        maxWait: 5_000,
        timeout: SCHEDULE_TRANSACTION_TIMEOUT_MS,
      }
    );

    generated += result.generated;
    if (result.paused) paused += 1;
  }

  return { processed: scheduleIds.length, generated, paused };
}
