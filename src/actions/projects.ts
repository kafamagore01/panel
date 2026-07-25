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
 * - "Başka branch'e sat" kipi: baz projenin kodu PRJ-001 ise → PRJ-001-02, -03...
 */
async function generateProjectCode(
  db: TenantDb,
  baseProjectId?: string
): Promise<string> {
  if (baseProjectId) {
    const base = await db.project.findUnique({ where: { id: baseProjectId } });
    if (!base) throw new Error("Baz proje bulunamadı.");
    // Baz kodun kök kısmı (PRJ-001-02 → PRJ-001)
    const root = base.code.replace(/-\d{2,}$/, "");
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
  baseProjectId?: string
): Promise<ActionResponse<{ code: string }>> {
  try {
    await requirePermission("record.manage");
    const db = await getTenantDb();
    const code = await generateProjectCode(db, baseProjectId || undefined);
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

    // Müşteri doğrulaması (aynı workspace)
    const customer = await db.customer.findUnique({
      where: { id: data.customer_id },
    });
    if (!customer) return fail("Seçilen müşteri bulunamadı.");

    // Webhook SSRF + şifreleme
    let encryptedSecret: string | undefined;
    if (data.license_webhook_url) {
      await assertSafeWebhookUrl(data.license_webhook_url);
      encryptedSecret = encryptSecret(data.license_webhook_secret!);
    }

    const code = await generateProjectCode(
      db,
      data.sell_to_branch ? data.base_project_id : undefined
    );

    const created = await db.project.create({
      data: {
        workspace_id: ctx.workspaceId,
        customer_id: data.customer_id,
        product_id: data.product_id,
        owner_user_id: data.owner_user_id,
        code,
        name: data.name,
        branch_name: data.branch_name,
        description: data.description,
        status: data.status,
        start_date: data.start_date ? new Date(data.start_date) : undefined,
        target_end_date: data.target_end_date
          ? new Date(data.target_end_date)
          : undefined,
        budget: data.budget ?? undefined,
        currency: data.currency,
        live_url: data.live_url,
        admin_url: data.admin_url,
        repository_url: data.repository_url,
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
        live_url: data.live_url,
        admin_url: data.admin_url,
        repository_url: data.repository_url,
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
