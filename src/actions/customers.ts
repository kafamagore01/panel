"use server";

import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { writeAudit } from "@/lib/audit";
import { customerSchema } from "@/lib/validation/customer";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";
import { revalidatePath } from "next/cache";

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  console.error(error);
  return fail("İşlem sırasında beklenmeyen bir hata oluştu.");
}

export async function createCustomer(
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = customerSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);

    const db = await getTenantDb();
    // workspace_id tenant katmanı tarafından zorlanır; tip uyumu için de eklenir.
    const created = await db.customer.create({
      data: { ...parsed.data, workspace_id: ctx.workspaceId },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "CREATE",
      auditable_type: "customer",
      auditable_id: created.id,
      after_data: created,
    });

    revalidatePath("/musteriler");
    return ok({ id: created.id }, "Müşteri oluşturuldu.");
  } catch (error) {
    return handleError(error);
  }
}

export async function updateCustomer(
  id: string,
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = customerSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);

    const db = await getTenantDb();
    const before = await db.customer.findUnique({ where: { id } });
    if (!before) return fail("Müşteri bulunamadı.");

    const updated = await db.customer.update({
      where: { id },
      data: parsed.data,
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "UPDATE",
      auditable_type: "customer",
      auditable_id: id,
      before_data: before,
      after_data: updated,
    });

    revalidatePath("/musteriler");
    return ok({ id }, "Müşteri güncellendi.");
  } catch (error) {
    return handleError(error);
  }
}

/** Arşivleme: projesi olan müşteri arşivlenemez. */
export async function archiveCustomer(
  id: string
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.archive");
    const db = await getTenantDb();

    const customer = await db.customer.findUnique({ where: { id } });
    if (!customer) return fail("Müşteri bulunamadı.");

    const projectCount = await db.project.count({ where: { customer_id: id } });
    if (projectCount > 0) {
      return fail(
        "Bu müşteriye ait projeler bulunduğu için arşivlenemez. Önce projeleri arşivleyin."
      );
    }

    await db.customer.update({
      where: { id },
      data: { status: "archived", deleted_at: new Date() },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "ARCHIVE",
      auditable_type: "customer",
      auditable_id: id,
      before_data: customer,
    });

    revalidatePath("/musteriler");
    return ok(null, "Müşteri arşivlendi.");
  } catch (error) {
    return handleError(error);
  }
}
