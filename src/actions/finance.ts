"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { validateTenantReferences } from "@/lib/db/tenant-references";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import {
  invoiceSchema,
  paymentSchema,
  scheduleSchema,
} from "@/lib/validation/finance";
import { computeInvoiceTotals, buildCustomerSnapshot } from "@/lib/finance";
import { nextInvoiceNumber } from "@/lib/finance/invoice-number";
import { calculatePaymentState } from "@/lib/finance/payment-state";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";
import { logError } from "@/lib/logger";

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  logError("action.finance_failed", error);
  return fail("İşlem sırasında beklenmeyen bir hata oluştu.");
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
    const created = await prisma.$transaction(async (tx) => {
      const invoice_no = await nextInvoiceNumber(
        tx,
        ctx.workspaceId,
        new Date().getFullYear()
      );
      return tx.invoice.create({
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
    return ok(
      { id: created.id, invoice_no: created.invoice_no },
      `Fatura oluşturuldu: ${created.invoice_no}`
    );
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
    type VoidResult =
      | { kind: "error"; message: string }
      | { kind: "ok"; previousStatus: string };

    const result = await prisma.$transaction(async (tx): Promise<VoidResult> => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM invoices
        WHERE id = ${id}::uuid
          AND workspace_id = ${ctx.workspaceId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) {
        return { kind: "error", message: "Fatura bulunamadı." };
      }

      const invoice = await tx.invoice.findUnique({ where: { id } });
      if (!invoice) {
        return { kind: "error", message: "Fatura bulunamadı." };
      }
      if (!["issued", "overdue"].includes(invoice.status)) {
        return {
          kind: "error",
          message: "Yalnızca düzenlenmiş veya gecikmiş faturalar iptal edilebilir.",
        };
      }
      if (Number(invoice.paid_total) > 0) {
        return {
          kind: "error",
          message: "Ödeme alınmış faturalar iptal edilemez.",
        };
      }

      await tx.invoice.update({
        where: { id },
        data: { status: "void", balance_due: 0 },
      });
      return { kind: "ok", previousStatus: invoice.status };
    });
    if (result.kind === "error") return fail(result.message);

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "VOID",
      auditable_type: "invoice",
      auditable_id: id,
      before_data: { status: result.previousStatus },
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
      | { kind: "replay"; status: string; invoiceId: string }
      | { kind: "error"; message: string }
      | { kind: "ok"; status: string; invoiceId: string };

    const result = await prisma.$transaction(async (tx): Promise<TxResult> => {
      // Aynı faturadaki ödeme/iptal işlemlerini seri hale getir.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM invoices
        WHERE id = ${data.invoice_id}::uuid
          AND workspace_id = ${workspaceId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) {
        return { kind: "error", message: "Fatura bulunamadı." };
      }

      // Kilit alındıktan sonra tekrar kontrol edilir; eşzamanlı aynı-key isteği
      // ilk transaction commit ettikten sonra burada güvenle görülür.
      const existing = await tx.payment.findUnique({
        where: { idempotency_key: data.idempotency_key },
        include: {
          invoice: {
            select: { id: true, workspace_id: true, status: true },
          },
        },
      });
      if (existing) {
        if (
          existing.invoice_id !== data.invoice_id ||
          existing.invoice.workspace_id !== workspaceId ||
          Number(existing.amount) !== data.amount
        ) {
          return {
            kind: "error",
            message:
              "Idempotency anahtarı farklı bir ödeme isteğinde kullanılmış.",
          };
        }
        return {
          kind: "replay",
          status: existing.invoice.status,
          invoiceId: existing.invoice.id,
        };
      }

      const invoice = await tx.invoice.findUnique({
        where: { id: data.invoice_id },
      });
      if (!invoice) return { kind: "error", message: "Fatura bulunamadı." };
      if (invoice.status === "void") return { kind: "error", message: "İptal edilmiş faturaya ödeme alınamaz." };
      if (invoice.status === "paid") return { kind: "error", message: "Fatura zaten tamamen ödenmiş." };

      const paymentState = calculatePaymentState(
        Number(invoice.total),
        Number(invoice.paid_total),
        data.amount
      );
      if (!paymentState.ok) {
        return {
          kind: "error",
          message: `Ödeme tutarı bakiyeden (${paymentState.balance.toFixed(2)}) fazla olamaz.`,
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

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paid_total: paymentState.paidTotal,
          balance_due: paymentState.balanceDue,
          status: paymentState.status,
        },
      });

      return {
        kind: "ok",
        status: paymentState.status,
        invoiceId: invoice.id,
      };
    });

    if (result.kind === "error") return fail(result.message);
    if (result.kind === "replay") {
      return ok(
        { status: result.status },
        "Ödeme daha önce kaydedilmiş; mevcut sonuç döndürüldü."
      );
    }

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
    const [customer, references] = await Promise.all([
      db.customer.findUnique({ where: { id: data.customer_id } }),
      validateTenantReferences(db, ctx.workspaceId, {
        customerId: data.customer_id,
        projectId: data.project_id,
        requireProjectCustomerMatch: true,
      }),
    ]);
    if (!customer) return fail("Müşteri bulunamadı.");
    if (!references.ok) return fail(references.message);

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
