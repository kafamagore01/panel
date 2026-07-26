"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { validateTenantReferences } from "@/lib/db/tenant-references";
import { writeAudit } from "@/lib/audit";
import { normalizeDomain } from "@/lib/domain";
import { domainSchema, importLicenseDomainSchema } from "@/lib/validation/domain";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";
import { logError } from "@/lib/logger";

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  logError("action.domain_failed", error);
  return fail("İşlem sırasında beklenmeyen bir hata oluştu.");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

type DomainData = ReturnType<typeof domainSchema.parse>;

function buildData(data: DomainData, normalized: string) {
  return {
    name: data.name,
    normalized_name: normalized,
    registrar: data.registrar,
    registrar_url: data.registrar_url,
    customer_id: data.customer_id ?? null,
    project_id: data.project_id ?? null,
    status: data.status,
    registered_at: data.registered_at ? new Date(data.registered_at) : null,
    expires_at: data.expires_at ? new Date(data.expires_at) : null,
    ssl_expires_at: data.ssl_expires_at ? new Date(data.ssl_expires_at) : null,
    auto_renew: data.auto_renew,
    nameservers: data.nameservers,
    annual_cost: data.annual_cost ?? null,
    currency: data.currency,
    notes: data.notes,
  };
}

/** Aynı workspace'te aynı alan adı var mı? (kendisi hariç) */
async function isDuplicate(
  db: Awaited<ReturnType<typeof getTenantDb>>,
  normalized: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await db.domain.findFirst({
    where: { normalized_name: normalized },
    select: { id: true },
  });
  return Boolean(existing && existing.id !== excludeId);
}

export async function createDomain(
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = domainSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);

    const normalized = normalizeDomain(parsed.data.name);
    if (!normalized) return fail("Geçersiz alan adı biçimi.");

    const db = await getTenantDb();
    const references = await validateTenantReferences(db, ctx.workspaceId, {
      customerId: parsed.data.customer_id,
      projectId: parsed.data.project_id,
      requireProjectCustomerMatch: true,
    });
    if (!references.ok) return fail(references.message);

    if (await isDuplicate(db, normalized)) {
      return fail("Bu alan adı zaten envanterde kayıtlı.");
    }

    let created;
    try {
      created = await db.domain.create({
        data: { ...buildData(parsed.data, normalized), workspace_id: ctx.workspaceId },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail("Bu alan adı daha önce kaydedilmiş (arşivlenmiş olabilir).");
      }
      throw error;
    }

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "CREATE",
      auditable_type: "domain",
      auditable_id: created.id,
      after_data: created,
    });

    revalidatePath("/domainler");
    return ok({ id: created.id }, "Alan adı eklendi.");
  } catch (error) {
    return handleError(error);
  }
}

export async function updateDomain(
  id: string,
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = domainSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);

    const normalized = normalizeDomain(parsed.data.name);
    if (!normalized) return fail("Geçersiz alan adı biçimi.");

    const db = await getTenantDb();
    const before = await db.domain.findUnique({ where: { id } });
    if (!before) return fail("Alan adı bulunamadı.");
    const references = await validateTenantReferences(db, ctx.workspaceId, {
      customerId: parsed.data.customer_id,
      projectId: parsed.data.project_id,
      requireProjectCustomerMatch: true,
    });
    if (!references.ok) return fail(references.message);

    if (await isDuplicate(db, normalized, id)) {
      return fail("Bu alan adı zaten envanterde kayıtlı.");
    }

    const updated = await db.domain.update({
      where: { id },
      data: buildData(parsed.data, normalized),
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "UPDATE",
      auditable_type: "domain",
      auditable_id: id,
      before_data: before,
      after_data: updated,
    });

    revalidatePath("/domainler");
    return ok({ id }, "Alan adı güncellendi.");
  } catch (error) {
    return handleError(error);
  }
}

export async function archiveDomain(id: string): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.archive");
    const db = await getTenantDb();
    const domain = await db.domain.findUnique({ where: { id } });
    if (!domain) return fail("Alan adı bulunamadı.");

    await db.domain.update({
      where: { id },
      data: { status: "cancelled", deleted_at: new Date() },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "ARCHIVE",
      auditable_type: "domain",
      auditable_id: id,
      before_data: domain,
    });

    revalidatePath("/domainler");
    return ok(null, "Alan adı envanterden çıkarıldı.");
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Bir lisans domainini envantere aktarır. Lisans domainleri workspace_id
 * taşımadığı için kayda daima tenant-scoped lisans üzerinden erişilir.
 */
export async function importLicenseDomain(
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = importLicenseDomainSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { license_domain_id } = parsed.data;

    const db = await getTenantDb();
    const license = await db.license.findFirst({
      where: { domains: { some: { id: license_domain_id } } },
      select: {
        project: { select: { id: true, customer_id: true } },
        domains: {
          where: { id: license_domain_id },
          select: { domain: true, normalized_domain: true },
        },
      },
    });

    const licenseDomain = license?.domains[0];
    if (!licenseDomain) return fail("Lisans domaini bulunamadı.");

    if (await isDuplicate(db, licenseDomain.normalized_domain)) {
      return fail("Bu alan adı zaten envanterde kayıtlı.");
    }

    let created;
    try {
      created = await db.domain.create({
        data: {
          workspace_id: ctx.workspaceId,
          name: licenseDomain.domain,
          normalized_name: licenseDomain.normalized_domain,
          project_id: license?.project.id ?? null,
          customer_id: license?.project.customer_id ?? null,
          status: "active",
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail("Bu alan adı daha önce kaydedilmiş (arşivlenmiş olabilir).");
      }
      throw error;
    }

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "IMPORT_LICENSE_DOMAIN",
      auditable_type: "domain",
      auditable_id: created.id,
      after_data: { license_domain_id, domain: created.normalized_name },
    });

    revalidatePath("/domainler");
    return ok({ id: created.id }, "Alan adı envantere eklendi. Süre bilgilerini tamamlayın.");
  } catch (error) {
    return handleError(error);
  }
}
