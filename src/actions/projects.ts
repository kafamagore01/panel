"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { getTenantDb, type TenantDb } from "@/lib/db/tenant";
import { writeAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto/encryption";
import { assertSafeWebhookUrl, SsrfError } from "@/lib/security/ssrf-guard";
import { projectSchema } from "@/lib/validation/project";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  if (error instanceof SsrfError) return fail(error.message);
  console.error(error);
  return fail("İşlem sırasında beklenmeyen bir hata oluştu.");
}

/**
 * Sonraki proje kodunu üretir.
 * - Normal kip: en yüksek PRJ-NNN + 1 → PRJ-001, PRJ-002...
 * - Mevcut projeyi yeniden satma kipi: kaynak kod PRJ-001 ise → PRJ-001-02, -03...
 */
async function generateProjectCode(
  db: TenantDb,
  sourceProjectId?: string
): Promise<string> {
  if (sourceProjectId) {
    const source = await db.project.findUnique({ where: { id: sourceProjectId } });
    if (!source) throw new Error("Kaynak proje bulunamadı.");
    // Kaynak kodun kök kısmı (PRJ-001-02 → PRJ-001)
    const root = source.code.replace(/-\d{2,}$/, "");
    const siblings = await db.project.findMany({
      where: { code: { startsWith: `${root}-` } },
      select: { code: true },
    });
    let maxSuffix = 1;
    const suffixRe = new RegExp(`^${root}-(\\d{2,})$`);
    for (const s of siblings) {
      const m = s.code.match(suffixRe);
      if (m) maxSuffix = Math.max(maxSuffix, Number.parseInt(m[1], 10));
    }
    return `${root}-${String(maxSuffix + 1).padStart(2, "0")}`;
  }

  const projects = await db.project.findMany({
    where: { code: { startsWith: "PRJ-" } },
    select: { code: true },
  });
  let max = 0;
  for (const p of projects) {
    const m = p.code.match(/^PRJ-(\d{3,})$/);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `PRJ-${String(max + 1).padStart(3, "0")}`;
}

/** Form için önizleme: bir sonraki kodu döndürür. */
export async function previewNextProjectCode(
  sourceProjectId?: string
): Promise<ActionResponse<{ code: string }>> {
  try {
    await requirePermission("record.manage");
    const db = await getTenantDb();
    const code = await generateProjectCode(db, sourceProjectId || undefined);
    return ok({ code });
  } catch (error) {
    return handleError(error);
  }
}

export async function createProject(
  input: unknown
): Promise<ActionResponse<{ id: string; code: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = projectSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const data = parsed.data;

    const db = await getTenantDb();

    // Müşteri ve varsa kaynak proje doğrulaması (tenant client aynı workspace'i zorlar).
    const [customer, sourceProject] = await Promise.all([
      db.customer.findUnique({ where: { id: data.customer_id } }),
      data.reuse_existing_project && data.source_project_id
        ? db.project.findUnique({ where: { id: data.source_project_id } })
        : Promise.resolve(null),
    ]);
    if (!customer) return fail("Seçilen müşteri bulunamadı.");
    if (data.reuse_existing_project && !sourceProject) {
      return fail("Seçilen kaynak proje bulunamadı.");
    }
    if (sourceProject?.status === "archived") {
      return fail("Arşivlenmiş bir proje kaynak olarak kullanılamaz.");
    }

    // Webhook SSRF + şifreleme
    let encryptedSecret: string | undefined;
    if (data.license_webhook_url) {
      await assertSafeWebhookUrl(data.license_webhook_url);
      encryptedSecret = encryptSecret(data.license_webhook_secret!);
    }

    const code = await generateProjectCode(
      db,
      sourceProject?.id
    );

    const created = await db.project.create({
      data: {
        workspace_id: ctx.workspaceId,
        customer_id: data.customer_id,
        source_project_id: sourceProject?.id,
        // Kaynak projede tanımlıysa ürün ve repo kimliği aynı kalır.
        product_id: sourceProject?.product_id ?? data.product_id,
        owner_user_id: data.owner_user_id,
        code,
        name: data.name,
        branch_name: sourceProject?.branch_name ?? data.branch_name,
        description: data.description,
        status: data.status,
        start_date: data.start_date ? new Date(data.start_date) : undefined,
        target_end_date: data.target_end_date
          ? new Date(data.target_end_date)
          : undefined,
        budget: data.budget ?? undefined,
        currency: data.currency,
        manual_fx_rate: data.manual_fx_rate ?? undefined,
        live_url: data.live_url,
        admin_url: data.admin_url,
        repository_url: sourceProject?.repository_url ?? data.repository_url,
        github_repo_id: sourceProject?.github_repo_id ?? data.github_repo_id,
        github_repo_full_name:
          sourceProject?.github_repo_full_name ?? data.github_repo_full_name,
        tech_stack: data.tech_stack
          ? data.tech_stack.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        notes: data.notes,
        license_webhook_url: data.license_webhook_url,
        license_webhook_secret: encryptedSecret,
      },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "CREATE",
      auditable_type: "project",
      auditable_id: created.id,
      after_data: created,
    });

    revalidatePath("/projeler");
    return ok({ id: created.id, code }, `Proje oluşturuldu: ${code}`);
  } catch (error) {
    return handleError(error);
  }
}

export async function updateProject(
  id: string,
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = projectSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const data = parsed.data;

    const db = await getTenantDb();
    const before = await db.project.findUnique({ where: { id } });
    if (!before) return fail("Proje bulunamadı.");

    let encryptedSecret: string | undefined | null = undefined;
    if (data.license_webhook_url) {
      await assertSafeWebhookUrl(data.license_webhook_url);
      if (data.license_webhook_secret) {
        encryptedSecret = encryptSecret(data.license_webhook_secret);
      }
    } else {
      encryptedSecret = null; // webhook kaldırıldı
    }

    const updated = await db.project.update({
      where: { id },
      data: {
        customer_id: data.customer_id,
        product_id: data.product_id,
        owner_user_id: data.owner_user_id,
        name: data.name,
        branch_name: data.branch_name,
        description: data.description,
        status: data.status,
        start_date: data.start_date ? new Date(data.start_date) : null,
        target_end_date: data.target_end_date
          ? new Date(data.target_end_date)
          : null,
        budget: data.budget ?? null,
        currency: data.currency,
        manual_fx_rate: data.manual_fx_rate ?? null,
        live_url: data.live_url,
        admin_url: data.admin_url,
        repository_url: data.repository_url,
        // Boş gelirse eşleşme kaldırılmış demektir (null'a çekilir)
        github_repo_id: data.github_repo_id ?? null,
        github_repo_full_name: data.github_repo_full_name ?? null,
        tech_stack: data.tech_stack
          ? data.tech_stack.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        notes: data.notes,
        license_webhook_url: data.license_webhook_url ?? null,
        ...(encryptedSecret !== undefined
          ? { license_webhook_secret: encryptedSecret }
          : {}),
      },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "UPDATE",
      auditable_type: "project",
      auditable_id: id,
      before_data: before,
      after_data: updated,
    });

    revalidatePath("/projeler");
    return ok({ id }, "Proje güncellendi.");
  } catch (error) {
    return handleError(error);
  }
}

/** Arşivleme: lisansı veya sunucusu olan proje arşivlenemez. */
export async function archiveProject(id: string): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.archive");
    const db = await getTenantDb();

    const project = await db.project.findUnique({ where: { id } });
    if (!project) return fail("Proje bulunamadı.");

    const [licenseCount, serverCount] = await Promise.all([
      db.license.count({ where: { project_id: id } }),
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM project_server WHERE project_id = ${id}::uuid
      `,
    ]);
    const linkedServers = Number(serverCount[0]?.count ?? 0);

    if (licenseCount > 0 || linkedServers > 0) {
      return fail(
        "Bu projeye bağlı lisans veya sunucu bulunduğu için arşivlenemez. Önce bağlantıları kaldırın."
      );
    }

    await db.project.update({
      where: { id },
      data: { status: "archived", deleted_at: new Date() },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "ARCHIVE",
      auditable_type: "project",
      auditable_id: id,
      before_data: project,
    });

    revalidatePath("/projeler");
    return ok(null, "Proje arşivlendi.");
  } catch (error) {
    return handleError(error);
  }
}
