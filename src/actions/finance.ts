"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import {
  invoiceSchema,
  paymentSchema,
  scheduleSchema,
} from "@/lib/validation/finance";
import { computeInvoiceTotals, buildCustomerSnapshot } from "@/lib/finance";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  console.error(error);
  return fail("İşlem sırasında beklenmeyen bir hata oluştu.");
}

/** Workspace içinde sıralı fatura numarası üretir: FT-YYYY-NNNN */
async function generateInvoiceNo(workspaceId: string): Promise<string> {
  const year = new Date().getFullYear();
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

export async function createInvoice(
  input: unknown
): Promise<ActionResponse<{ id: string; invoice_no: string }>> {
  try {
    const ctx = await requirePermission("finance.manage");
    const parsed = invoiceSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const data = parsed.data;

    const db = await getTenantDb();
    const [customer, project] = await Promise.all([
      db.customer.findUnique({ where: { id: data.customer_id } }),
      data.project_id
        ? db.project.findUnique({
            where: { id: data.project_id },
            select: { customer_id: true },
          })
        : Promise.resolve(null),
    ]);
    if (!customer) return fail("Müşteri bulunamadı.");
    if (data.project_id && !project) return fail("Proje bulunamadı.");
    if (project && project.customer_id !== data.customer_id) {
      return fail("Seçilen proje müşteriye ait değil.");
    }

    const { subtotal, tax_total, total } = computeInvoiceTotals(
      data.subtotal,
      data.tax_rate
    );
    const issuedOn = new Date(data.issued_on);
    const dueOn = new Date(data.payment_on);
    const invoice_no = await generateInvoiceNo(ctx.workspaceId);

    const created = await db.invoice.create({
      data: {
        workspace_id: ctx.workspaceId,
        customer_id: data.customer_id,
        project_id: data.project_id,
        invoice_no,
        issued_on: issuedOn,
        due_on: dueOn,
        period_start: data.period_start ? new Date(data.period_start) : null,
        period_end: data.period_end ? new Date(data.period_end) : null,
        status: "issued",
        currency: data.currency,
        manual_fx_rate: data.manual_fx_rate ?? null,
        subtotal,
        tax_total,
        total,
        paid_total: 0,
        balance_due: total,
        description: data.description,
        notes: data.notes,
        customer_snapshot: buildCustomerSnapshot(customer),
      },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "CREATE",
      auditable_type: "invoice",
      auditable_id: created.id,
      after_data: created,
    });

    revalidatePath("/finans");
    return ok({ id: created.id, invoice_no }, `Fatura oluşturuldu: ${invoice_no}`);
  } catch (error) {
    return handleError(error);
  }
}

/** Ödeme alınmamış düzenlenmiş/gecikmiş faturanın alanlarını günceller. */
export async function updateInvoice(
  id: string,
  input: unknown
): Promise<ActionResponse<{ id: string; invoice_no: string }>> {
  try {
    const ctx = await requirePermission("finance.manage");
    const parsed = invoiceSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const data = parsed.data;

    const db = await getTenantDb();
    const [invoice, customer, project] = await Promise.all([
      db.invoice.findUnique({ where: { id } }),
      db.customer.findUnique({ where: { id: data.customer_id } }),
      data.project_id
        ? db.project.findUnique({
            where: { id: data.project_id },
            select: { customer_id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!invoice) return fail("Fatura bulunamadı.");
    if (!customer) return fail("Müşteri bulunamadı.");
    if (data.project_id && !project) return fail("Proje bulunamadı.");
    if (project && project.customer_id !== data.customer_id) {
      return fail("Seçilen proje müşteriye ait değil.");
    }
    if (!["issued", "overdue"].includes(invoice.status)) {
      return fail("Yalnızca düzenlenmiş veya gecikmiş faturalar değiştirilebilir.");
    }
    if (Number(invoice.paid_total) > 0) {
      return fail("Ödeme alınmış faturalar değiştirilemez.");
    }

    const { subtotal, tax_total, total } = computeInvoiceTotals(
      data.subtotal,
      data.tax_rate
    );
    const issuedOn = new Date(data.issued_on);
    const dueOn = new Date(data.payment_on);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const status = data.payment_on < today ? "overdue" : "issued";

    // updateMany koşulları, eşzamanlı bir ödeme kaydı oluşursa düzenlemeyi güvenle durdurur.
    const updated = await db.invoice.updateMany({
      where: {
        id,
        status: { in: ["issued", "overdue"] },
        paid_total: 0,
      },
      data: {
        customer_id: data.customer_id,
        project_id: data.project_id ?? null,
        issued_on: issuedOn,
        due_on: dueOn,
        period_start: data.period_start ? new Date(data.period_start) : null,
        period_end: data.period_end ? new Date(data.period_end) : null,
        status,
        currency: data.currency,
        manual_fx_rate: data.manual_fx_rate ?? null,
        subtotal,
        tax_total,
        total,
        balance_due: total,
        description: data.description ?? null,
        notes: data.notes ?? null,
        customer_snapshot: buildCustomerSnapshot(customer),
      },
    });

    if (updated.count !== 1) {
      return fail("Fatura bu sırada değişti veya ödeme aldı. Sayfayı yenileyip tekrar deneyin.");
    }

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "UPDATE",
      auditable_type: "invoice",
      auditable_id: id,
      before_data: {
        customer_id: invoice.customer_id,
        project_id: invoice.project_id,
        issued_on: invoice.issued_on,
        due_on: invoice.due_on,
        status: invoice.status,
        currency: invoice.currency,
        subtotal: Number(invoice.subtotal),
        tax_total: Number(invoice.tax_total),
        total: Number(invoice.total),
        description: invoice.description,
        notes: invoice.notes,
      },
      after_data: {
        customer_id: data.customer_id,
        project_id: data.project_id ?? null,
        issued_on: issuedOn,
        due_on: dueOn,
        status,
        currency: data.currency,
        subtotal,
        tax_total,
        total,
        description: data.description ?? null,
        notes: data.notes ?? null,
      },
    });

    revalidatePath("/finans");
    return ok(
      { id, invoice_no: invoice.invoice_no },
      `Fatura güncellendi: ${invoice.invoice_no}`
    );
  } catch (error) {
    return handleError(error);
  }
}

/** Fatura iptal: yalnızca issued/overdue ve paid_total == 0 olan faturalar. */
export async function voidInvoice(id: string): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("finance.manage");
    const db = await getTenantDb();
    const invoice = await db.invoice.findUnique({ where: { id } });
    if (!invoice) return fail("Fatura bulunamadı.");

    if (!["issued", "overdue"].includes(invoice.status)) {
      return fail("Yalnızca düzenlenmiş veya gecikmiş faturalar iptal edilebilir.");
    }
    if (Number(invoice.paid_total) > 0) {
      return fail("Ödeme alınmış faturalar iptal edilemez.");
    }

    await db.invoice.update({
      where: { id },
      data: { status: "void", balance_due: 0 },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "VOID",
      auditable_type: "invoice",
      auditable_id: id,
      before_data: { status: invoice.status },
      after_data: { status: "void" },
    });

    revalidatePath("/finans");
    return ok(null, "Fatura iptal edildi.");
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Ödeme kaydet. idempotency_key zorunlu (mükerrer engeli), bakiye aşımı reddi,
 * paid_total/balance_due yeniden hesaplanır → paid / partial.
 */
export async function recordPayment(
  input: unknown
): Promise<ActionResponse<{ status: string }>> {
  try {
    const ctx = await requirePermission("finance.manage");
    const parsed = paymentSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const data = parsed.data;
    const workspaceId = ctx.workspaceId;

    type TxResult =
      | { kind: "duplicate" }
      | { kind: "error"; message: string }
      | { kind: "ok"; status: string; invoiceId: string };

    const result = await prisma.$transaction(async (tx): Promise<TxResult> => {
      // Mükerrer kontrolü (idempotency)
      const existing = await tx.payment.findUnique({
        where: { idempotency_key: data.idempotency_key },
      });
      if (existing) {
        return { kind: "duplicate" };
      }

      const invoice = await tx.invoice.findFirst({
        where: { id: data.invoice_id, workspace_id: workspaceId },
      });
      if (!invoice) return { kind: "error", message: "Fatura bulunamadı." };
      if (invoice.status === "void") return { kind: "error", message: "İptal edilmiş faturaya ödeme alınamaz." };
      if (invoice.status === "paid") return { kind: "error", message: "Fatura zaten tamamen ödenmiş." };

      const balance = Number(invoice.balance_due);
      if (data.amount > balance + 0.001) {
        return {
          kind: "error",
          message: `Ödeme tutarı bakiyeden (${balance.toFixed(2)}) fazla olamaz.`,
        };
      }

      await tx.payment.create({
        data: {
          workspace_id: workspaceId,
          customer_id: invoice.customer_id,
          invoice_id: invoice.id,
          amount: data.amount,
          currency: invoice.currency,
          paid_on: new Date(data.paid_on),
          method: data.method,
          status: "completed",
          reference: data.reference,
          idempotency_key: data.idempotency_key,
        },
      });

      const newPaid = Math.round((Number(invoice.paid_total) + data.amount) * 100) / 100;
      const newBalance = Math.round((Number(invoice.total) - newPaid) * 100) / 100;
      const newStatus = newBalance <= 0.001 ? "paid" : "partial";

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paid_total: newPaid,
          balance_due: newBalance < 0 ? 0 : newBalance,
          status: newStatus,
        },
      });

      return { kind: "ok", status: newStatus, invoiceId: invoice.id };
    });

    if (result.kind === "duplicate") {
      return fail("Bu ödeme zaten kaydedilmiş (mükerrer işlem engellendi).");
    }
    if (result.kind === "error") return fail(result.message);

    await writeAudit({
      workspace_id: workspaceId,
      actor_user_id: ctx.user.id,
      action: "PAYMENT",
      auditable_type: "invoice",
      auditable_id: result.invoiceId,
      after_data: { amount: data.amount, new_status: result.status },
    });

    revalidatePath("/finans");
    return ok({ status: result.status }, "Ödeme kaydedildi.");
  } catch (error) {
    return handleError(error);
  }
}

export async function createSchedule(
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await requirePermission("finance.manage");
    const parsed = scheduleSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const data = parsed.data;

    const db = await getTenantDb();
    const customer = await db.customer.findUnique({ where: { id: data.customer_id } });
    if (!customer) return fail("Müşteri bulunamadı.");

    const startsOn = new Date(data.starts_on);
    const created = await db.billingSchedule.create({
      data: {
        workspace_id: ctx.workspaceId,
        customer_id: data.customer_id,
        project_id: data.project_id,
        title: data.title,
        amount: data.amount,
        currency: data.currency,
        manual_fx_rate: data.manual_fx_rate ?? null,
        tax_rate: data.tax_rate,
        interval_unit: data.interval_unit,
        interval_count: data.interval_count,
        starts_on: startsOn,
        ends_on: data.ends_on ? new Date(data.ends_on) : null,
        next_issue_on: startsOn,
        due_days: data.due_days,
        status: "active",
      },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "CREATE",
      auditable_type: "billing_schedule",
      auditable_id: created.id,
      after_data: created,
    });

    revalidatePath("/finans");
    return ok({ id: created.id }, "Yinelenen ödeme planı oluşturuldu.");
  } catch (error) {
    return handleError(error);
  }
}

export async function toggleSchedule(
  id: string,
  pause: boolean
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("finance.manage");
    const db = await getTenantDb();
    const schedule = await db.billingSchedule.findUnique({ where: { id } });
    if (!schedule) return fail("Plan bulunamadı.");
    if (schedule.status === "completed") return fail("Tamamlanmış plan değiştirilemez.");

    await db.billingSchedule.update({
      where: { id },
      data: { status: pause ? "paused" : "active" },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: pause ? "PAUSE_SCHEDULE" : "RESUME_SCHEDULE",
      auditable_type: "billing_schedule",
      auditable_id: id,
    });

    revalidatePath("/finans");
    return ok(null, pause ? "Plan duraklatıldı." : "Plan yeniden başlatıldı.");
  } catch (error) {
    return handleError(error);
  }
}
