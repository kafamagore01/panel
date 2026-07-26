"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { prisma } from "@/lib/db/prisma";
import { validateTenantReferences } from "@/lib/db/tenant-references";
import { writeAudit } from "@/lib/audit";
import { productSchema } from "@/lib/validation/product";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";
import { logError } from "@/lib/logger";

const productIdSchema = z.uuid("Ürün kimliği geçersiz.");

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return fail("Bu ürün kodu bu çalışma alanında zaten kullanılıyor.");
  }
  logError("action.product_failed", error);
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
    const references = await validateTenantReferences(db, ctx.workspaceId, {
      customerId: parsed.data.customer_id,
    });
    if (!references.ok) return fail(references.message);

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
    const references = await validateTenantReferences(db, ctx.workspaceId, {
      customerId: parsed.data.customer_id,
    });
    if (!references.ok) return fail(references.message);

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
    if (!productIdSchema.safeParse(id).success) {
      return fail("Ürün kimliği geçersiz.");
    }

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM products
          WHERE id = ${id}::uuid
            AND workspace_id = ${ctx.workspaceId}::uuid
            AND deleted_at IS NULL
          FOR UPDATE
        `;
        const product = await tx.product.findFirst({
          where: {
            id,
            workspace_id: ctx.workspaceId,
            deleted_at: null,
          },
        });
        if (!product) {
          return { kind: "error" as const, message: "Ürün bulunamadı." };
        }
        const usage = await tx.project.count({
          where: {
            workspace_id: ctx.workspaceId,
            product_id: id,
            deleted_at: null,
          },
        });
        if (usage > 0) {
          return {
            kind: "error" as const,
            message: "Bu ürün projelerde kullanıldığı için silinemez.",
          };
        }
        await tx.product.update({
          where: { id },
          data: { deleted_at: new Date() },
        });
        return { kind: "ok" as const, product };
      },
      { maxWait: 5_000, timeout: 15_000 }
    );
    if (result.kind === "error") return fail(result.message);

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "DELETE",
      auditable_type: "product",
      auditable_id: id,
      before_data: result.product,
    });

    revalidatePath("/projeler");
    return ok(null, "Ürün silindi.");
  } catch (error) {
    return handleError(error);
  }
}
