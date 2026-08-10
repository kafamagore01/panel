"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { prisma } from "@/lib/db/prisma";
import { validateTenantReferences } from "@/lib/db/tenant-references";
import { writeAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto/encryption";
import { assertSafeWebhookUrl, SsrfError } from "@/lib/security/ssrf-guard";
import { projectSchema } from "@/lib/validation/project";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";
import { logError } from "@/lib/logger";

const projectIdSchema = z.uuid("Proje kimliği geçersiz.");

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  if (error instanceof SsrfError) return fail(error.message);
  logError("action.project_failed", error);
  return fail("İşlem sırasında beklenmeyen bir hata oluştu.");
}

/**
 * Sonraki proje kodunu üretir.
 * - Normal kip: en yüksek PRJ-NNN + 1 → PRJ-001, PRJ-002...
 * - Mevcut projeyi yeniden satma kipi: kaynak kod PRJ-001 ise → PRJ-001-02, -03...
 */
async function generateProjectCode(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  sourceProjectId?: string
): Promise<string> {
  if (sourceProjectId) {
    const source = await tx.project.findFirst({
      where: {
        id: sourceProjectId,
        workspace_id: workspaceId,
        deleted_at: null,
      },
      select: { code: true },
    });
    if (!source) throw new Error("Kaynak proje bulunamadı.");
    const root = source.code.replace(/-\d{2,}$/, "");
    const rows = await tx.$queryRaw<Array<{ max_suffix: number }>>`
      SELECT COALESCE(
        MAX(SUBSTRING(code FROM CHAR_LENGTH(${root}) + 2)::integer),
        1
      )::integer AS max_suffix
      FROM projects
      WHERE workspace_id = ${workspaceId}::uuid
        AND starts_with(code, ${`${root}-`})
        AND SUBSTRING(code FROM CHAR_LENGTH(${root}) + 2) ~ '^[0-9]{2,}$'
    `;
    const maxSuffix = rows[0]?.max_suffix ?? 1;
    return `${root}-${String(maxSuffix + 1).padStart(2, "0")}`;
  }

  const rows = await tx.$queryRaw<Array<{ max_code: number }>>`
    SELECT COALESCE(
      MAX(SUBSTRING(code FROM 5)::integer),
      0
    )::integer AS max_code
    FROM projects
    WHERE workspace_id = ${workspaceId}::uuid
      AND code ~ '^PRJ-[0-9]{3,}$'
  `;
  const max = rows[0]?.max_code ?? 0;
  return `PRJ-${String(max + 1).padStart(3, "0")}`;
}

/** Form için önizleme: bir sonraki kodu döndürür. */
export async function previewNextProjectCode(
  sourceProjectId?: string
): Promise<ActionResponse<{ code: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const code = await prisma.$transaction((tx) =>
      generateProjectCode(
        tx,
        ctx.workspaceId,
        sourceProjectId || undefined
      )
    );
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
    const references = await validateTenantReferences(db, ctx.workspaceId, {
      productId: sourceProject?.product_id ?? data.product_id,
      ownerUserId: data.owner_user_id,
    });
    if (!references.ok) return fail(references.message);

    // Webhook SSRF + şifreleme
    let encryptedSecret: string | undefined;
    if (data.license_webhook_url) {
      await assertSafeWebhookUrl(data.license_webhook_url);
      encryptedSecret = encryptSecret(data.license_webhook_secret!);
    }

    const created = await prisma.$transaction(
      async (tx) => {
        // pg_advisory_xact_lock void döner; Prisma void kolonunu deserialize
        // edemediği için ::text'e çevrilir (bkz. nextInvoiceNumber).
        await tx.$queryRaw<Array<{ locked: string }>>`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`project-code:${ctx.workspaceId}`}, 0)
          )::text AS locked
        `;
        const code = await generateProjectCode(
          tx,
          ctx.workspaceId,
          sourceProject?.id
        );
        return tx.project.create({
          data: {
            workspace_id: ctx.workspaceId,
            customer_id: data.customer_id,
            source_project_id: sourceProject?.id,
            product_id: sourceProject?.product_id ?? data.product_id,
            owner_user_id: data.owner_user_id,
            code,
            name: data.name,
            branch_name: sourceProject?.branch_name ?? data.branch_name,
            description: data.description,
            status: data.status,
            start_date: data.start_date
              ? new Date(data.start_date)
              : undefined,
            target_end_date: data.target_end_date
              ? new Date(data.target_end_date)
              : undefined,
            budget: data.budget ?? undefined,
            currency: data.currency,
            manual_fx_rate: data.manual_fx_rate ?? undefined,
            live_url: data.live_url,
            admin_url: data.admin_url,
            repository_url:
              sourceProject?.repository_url ?? data.repository_url,
            github_repo_id:
              sourceProject?.github_repo_id ?? data.github_repo_id,
            github_repo_full_name:
              sourceProject?.github_repo_full_name ??
              data.github_repo_full_name,
            tech_stack: data.tech_stack
              ? data.tech_stack
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : undefined,
            notes: data.notes,
            license_webhook_url: data.license_webhook_url,
            license_webhook_secret: encryptedSecret,
          },
        });
      },
      { maxWait: 5_000, timeout: 15_000 }
    );

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "CREATE",
      auditable_type: "project",
      auditable_id: created.id,
      after_data: created,
    });

    revalidatePath("/projeler");
    return ok(
      { id: created.id, code: created.code },
      `Proje oluşturuldu: ${created.code}`
    );
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
    const references = await validateTenantReferences(db, ctx.workspaceId, {
      customerId: data.customer_id,
      productId: data.product_id,
      ownerUserId: data.owner_user_id,
    });
    if (!references.ok) return fail(references.message);

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
    if (!projectIdSchema.safeParse(id).success) {
      return fail("Proje kimliği geçersiz.");
    }

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM projects
          WHERE id = ${id}::uuid
            AND workspace_id = ${ctx.workspaceId}::uuid
            AND deleted_at IS NULL
          FOR UPDATE
        `;
        const project = await tx.project.findFirst({
          where: {
            id,
            workspace_id: ctx.workspaceId,
            deleted_at: null,
          },
        });
        if (!project) {
          return { kind: "error" as const, message: "Proje bulunamadı." };
        }

        const [licenseCount, serverCount] = await Promise.all([
          tx.license.count({
            where: { workspace_id: ctx.workspaceId, project_id: id },
          }),
          tx.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::bigint AS count
            FROM project_server
            WHERE project_id = ${id}::uuid
          `,
        ]);
        const linkedServers = Number(serverCount[0]?.count ?? 0);
        if (licenseCount > 0 || linkedServers > 0) {
          return {
            kind: "error" as const,
            message:
              "Bu projeye bağlı lisans veya sunucu bulunduğu için arşivlenemez. Önce bağlantıları kaldırın.",
          };
        }

        await tx.project.update({
          where: { id },
          data: { status: "archived", deleted_at: new Date() },
        });
        return { kind: "ok" as const, project };
      },
      { maxWait: 5_000, timeout: 15_000 }
    );
    if (result.kind === "error") return fail(result.message);

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "ARCHIVE",
      auditable_type: "project",
      auditable_id: id,
      before_data: result.project,
    });

    revalidatePath("/projeler");
    return ok(null, "Proje arşivlendi.");
  } catch (error) {
    return handleError(error);
  }
}
