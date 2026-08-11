"use server";

import { z } from "zod";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import {
  customerSchema,
  type CustomerInput,
} from "@/lib/validation/customer";
import {
  buildBranchLegalName,
  normalizeBranchName,
} from "@/lib/customer-name";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";
import { revalidatePath } from "next/cache";
import { logError } from "@/lib/logger";

const customerIdSchema = z.uuid("Müşteri kimliği geçersiz.");

type TenantDb = Awaited<ReturnType<typeof getTenantDb>>;

type CustomerBranchData = {
  legal_name: string;
  parent_customer_id: string | null;
  branch_name: string | null;
};

function getCustomerData(input: CustomerInput) {
  return {
    type: input.type,
    legal_name: input.legal_name,
    trade_name: input.trade_name,
    tax_number: input.tax_number,
    tax_office: input.tax_office,
    email: input.email,
    phone: input.phone,
    website_url: input.website_url,
    billing_address: input.billing_address,
    status: input.status,
    notes: input.notes,
  };
}

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  logError("action.customer_failed", error);
  return fail("İşlem sırasında beklenmeyen bir hata oluştu.");
}

async function resolveCustomerBranchData(
  db: TenantDb,
  input: CustomerInput,
  currentCustomerId?: string
): Promise<CustomerBranchData | ActionResponse<never>> {
  if (input.customer_kind === "headquarters") {
    return {
      legal_name: input.legal_name,
      parent_customer_id: null,
      branch_name: null,
    };
  }

  if (!input.parent_customer_id || !input.branch_name) {
    const fieldErrors: Record<string, string[]> = {};
    if (!input.parent_customer_id) {
      fieldErrors.parent_customer_id = ["Ana merkez seçin."];
    }
    if (!input.branch_name) {
      fieldErrors.branch_name = ["Şube adı girin."];
    }
    return fail("Şube bilgilerini kontrol edin.", fieldErrors);
  }

  if (input.parent_customer_id === currentCustomerId) {
    return fail("Bir müşteri kendi ana merkezi olamaz.", {
      parent_customer_id: ["Farklı bir ana merkez seçin."],
    });
  }

  if (currentCustomerId) {
    const branchCount = await db.customer.count({
      where: { parent_customer_id: currentCustomerId },
    });
    if (branchCount > 0) {
      return fail("Bağlı şubeleri olan bir ana merkez şubeye dönüştürülemez.", {
        customer_kind: ["Önce bağlı şubeleri başka bir ana merkeze taşıyın."],
      });
    }
  }

  const parent = await db.customer.findFirst({
    where: {
      id: input.parent_customer_id,
      parent_customer_id: null,
    },
    select: { id: true, legal_name: true },
  });
  if (!parent) {
    return fail("Seçilen ana merkez bulunamadı.", {
      parent_customer_id: ["Geçerli bir ana merkez seçin."],
    });
  }

  const branchName = normalizeBranchName(input.branch_name);
  if (branchName.length < 2) {
    return fail("Şube adını kontrol edin.", {
      branch_name: ["Şube adı en az 2 karakter olmalıdır."],
    });
  }

  return {
    legal_name: buildBranchLegalName(parent.legal_name, branchName),
    parent_customer_id: parent.id,
    branch_name: branchName,
  };
}

async function syncBranchLegalNames(
  db: TenantDb,
  parentCustomerId: string,
  parentLegalName: string
) {
  const branches = await db.customer.findMany({
    where: { parent_customer_id: parentCustomerId },
    select: { id: true, branch_name: true },
  });

  await Promise.all(
    branches
      .filter(
        (branch): branch is { id: string; branch_name: string } =>
          branch.branch_name !== null
      )
      .map((branch) =>
        db.customer.update({
          where: { id: branch.id },
          data: {
            legal_name: buildBranchLegalName(
              parentLegalName,
              branch.branch_name
            ),
          },
        })
      )
  );
}

export async function createCustomer(
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await requirePermission("customers.create");
    const parsed = customerSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);

    const db = await getTenantDb();
    const branchData = await resolveCustomerBranchData(db, parsed.data);
    if ("success" in branchData) return branchData;

    const customerData = getCustomerData(parsed.data);

    // workspace_id tenant katmanı tarafından zorlanır; tip uyumu için de eklenir.
    const created = await db.customer.create({
      data: {
        ...customerData,
        ...branchData,
        workspace_id: ctx.workspaceId,
      },
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
    const ctx = await requirePermission("customers.update");
    const parsed = customerSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);

    const db = await getTenantDb();
    const before = await db.customer.findUnique({ where: { id } });
    if (!before) return fail("Müşteri bulunamadı.");

    const branchData = await resolveCustomerBranchData(db, parsed.data, id);
    if ("success" in branchData) return branchData;

    const customerData = getCustomerData(parsed.data);

    const updated = await db.customer.update({
      where: { id },
      data: {
        ...customerData,
        ...branchData,
      },
    });

    if (
      before.parent_customer_id === null &&
      updated.parent_customer_id === null &&
      before.legal_name !== updated.legal_name
    ) {
      await syncBranchLegalNames(db, updated.id, updated.legal_name);
    }

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

/** Soft delete: projesi veya bağlı şubesi olan müşteri silinemez. */
export async function deleteCustomer(
  id: string
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("customers.delete");
    if (!customerIdSchema.safeParse(id).success) {
      return fail("Müşteri kimliği geçersiz.");
    }

    type ArchiveResult =
      | { kind: "error"; message: string }
      | { kind: "ok"; customer: NonNullable<Awaited<ReturnType<typeof prisma.customer.findUnique>>> };
    const result = await prisma.$transaction(
      async (tx): Promise<ArchiveResult> => {
        await tx.$queryRaw`
          SELECT id
          FROM customers
          WHERE id = ${id}::uuid
            AND workspace_id = ${ctx.workspaceId}::uuid
            AND deleted_at IS NULL
          FOR UPDATE
        `;
        const customer = await tx.customer.findFirst({
          where: {
            id,
            workspace_id: ctx.workspaceId,
            deleted_at: null,
          },
        });
        if (!customer) {
          return { kind: "error", message: "Müşteri bulunamadı." };
        }

        const [projectCount, branchCount] = await Promise.all([
          tx.project.count({
            where: {
              workspace_id: ctx.workspaceId,
              customer_id: id,
              deleted_at: null,
            },
          }),
          tx.customer.count({
            where: {
              workspace_id: ctx.workspaceId,
              parent_customer_id: id,
              deleted_at: null,
            },
          }),
        ]);
        if (branchCount > 0) {
          return {
            kind: "error",
            message:
              "Bu ana merkeze bağlı şubeler bulunduğu için silinemez. Önce şubeleri başka bir ana merkeze taşıyın veya silin.",
          };
        }
        if (projectCount > 0) {
          return {
            kind: "error",
            message:
              "Bu müşteriye ait projeler bulunduğu için silinemez. Önce projeleri silin.",
          };
        }

        await tx.customer.update({
          where: { id },
          data: { status: "archived", deleted_at: new Date() },
        });
        return { kind: "ok", customer };
      },
      { maxWait: 5_000, timeout: 15_000 }
    );
    if (result.kind === "error") return fail(result.message);

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "DELETE",
      auditable_type: "customer",
      auditable_id: id,
      before_data: result.customer,
    });

    revalidatePath("/musteriler");
    return ok(null, "Müşteri silindi.");
  } catch (error) {
    return handleError(error);
  }
}
