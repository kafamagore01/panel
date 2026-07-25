"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { writeAudit } from "@/lib/audit";
import { productSchema } from "@/lib/validation/product";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return fail("Bu ürün kodu bu çalışma alanında zaten kullanılıyor.");
  }
  console.error(error);
  return fail("İşlem sırasında beklenmeyen bir hata oluştu.");
}

export async function createProduct(
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);

    const db = await getTenantDb();
    const created = await db.product.create({
      data: { ...parsed.data, workspace_id: ctx.workspaceId },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "CREATE",
      auditable_type: "product",
      auditable_id: created.id,
      after_data: created,
    });

    revalidatePath("/projeler");
    return ok({ id: created.id }, "Ürün kataloğa eklendi.");
  } catch (error) {
    return handleError(error);
  }
}

export async function updateProduct(
  id: string,
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);

    const db = await getTenantDb();
    const before = await db.product.findUnique({ where: { id } });
    if (!before) return fail("Ürün bulunamadı.");

    const updated = await db.product.update({ where: { id }, data: parsed.data });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "UPDATE",
      auditable_type: "product",
      auditable_id: id,
      before_data: before,
      after_data: updated,
    });

    revalidatePath("/projeler");
    return ok({ id }, "Ürün güncellendi.");
  } catch (error) {
    return handleError(error);
  }
}

export async function deleteProduct(id: string): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.archive");
    const db = await getTenantDb();

    const usage = await db.project.count({ where: { product_id: id } });
    if (usage > 0) {
      return fail("Bu ürün projelerde kullanıldığı için silinemez.");
    }

    const before = await db.product.findUnique({ where: { id } });
    if (!before) return fail("Ürün bulunamadı.");

    await db.product.update({ where: { id }, data: { deleted_at: new Date() } });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "DELETE",
      auditable_type: "product",
      auditable_id: id,
      before_data: before,
    });

    revalidatePath("/projeler");
    return ok(null, "Ürün silindi.");
  } catch (error) {
    return handleError(error);
  }
}
