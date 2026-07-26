import { prisma } from "@/lib/db/prisma";
import type { TenantDb } from "@/lib/db/tenant";

export type TenantReferenceInput = {
  customerId?: string | null;
  projectId?: string | null;
  productId?: string | null;
  ownerUserId?: string | null;
  requireProjectCustomerMatch?: boolean;
};

export type TenantReferenceResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Yabancı anahtar UUID'sinin var olması tek başına yeterli değildir; bağlı
 * kaydın aktif workspace'e ait olduğunu ve owner seçiminin aktif üye olduğunu
 * doğrular. Tenant client müşteri/proje/ürün sorgularına workspace filtresini
 * otomatik ekler.
 */
export async function validateTenantReferences(
  db: TenantDb,
  workspaceId: string,
  input: TenantReferenceInput
): Promise<TenantReferenceResult> {
  const [customer, project, product, ownerMembership] = await Promise.all([
    input.customerId
      ? db.customer.findUnique({
          where: { id: input.customerId },
          select: { id: true },
        })
      : Promise.resolve(null),
    input.projectId
      ? db.project.findUnique({
          where: { id: input.projectId },
          select: { id: true, customer_id: true },
        })
      : Promise.resolve(null),
    input.productId
      ? db.product.findUnique({
          where: { id: input.productId },
          select: { id: true },
        })
      : Promise.resolve(null),
    input.ownerUserId
      ? prisma.workspaceUser.findUnique({
          where: {
            workspace_id_user_id: {
              workspace_id: workspaceId,
              user_id: input.ownerUserId,
            },
          },
          select: { status: true },
        })
      : Promise.resolve(null),
  ]);

  if (input.customerId && !customer) {
    return { ok: false, message: "Seçilen müşteri bu çalışma alanında bulunamadı." };
  }
  if (input.projectId && !project) {
    return { ok: false, message: "Seçilen proje bu çalışma alanında bulunamadı." };
  }
  if (input.productId && !product) {
    return { ok: false, message: "Seçilen ürün bu çalışma alanında bulunamadı." };
  }
  if (
    input.ownerUserId &&
    (!ownerMembership || ownerMembership.status !== "active")
  ) {
    return {
      ok: false,
      message: "Seçilen proje sorumlusu bu çalışma alanının aktif üyesi değil.",
    };
  }
  if (
    input.requireProjectCustomerMatch &&
    input.customerId &&
    project &&
    project.customer_id !== input.customerId
  ) {
    return { ok: false, message: "Seçilen proje müşteriye ait değil." };
  }

  return { ok: true };
}
