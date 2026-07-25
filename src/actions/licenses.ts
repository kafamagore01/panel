"use server";

import { revalidatePath } from "next/cache";
import type { LicenseStatus } from "@/generated/prisma/client";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { writeAudit } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/crypto/encryption";
import {
  generateLicenseKey,
  hashLicenseKey,
} from "@/lib/crypto/license-key";
import { normalizeDomain } from "@/lib/domain";
import {
  createLicenseSchema,
  changeStatusSchema,
  licenseDomainSchema,
} from "@/lib/validation/license";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";
import { enqueueLicenseWebhook } from "@/lib/queue/webhook-dispatch";

const RENEWAL_LOCK_MS = 15_000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  console.error(error);
  return fail("İşlem sırasında beklenmeyen bir hata oluştu.");
}

function keyPrefixOf(licenseKey: string): string {
  // PT-A8F2K-... → "PT-A8F2K"
  const parts = licenseKey.split("-");
  return `${parts[0]}-${parts[1]}`;
}

/** Yeni lisans üretir. Düz anahtar yalnızca yanıtta tek kez döner. */
export async function createLicense(
  input: unknown
): Promise<ActionResponse<{ id: string; licenseKey: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = createLicenseSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const data = parsed.data;

    const db = await getTenantDb();
    const project = await db.project.findUnique({ where: { id: data.project_id } });
    if (!project) return fail("Seçilen proje bulunamadı.");

    const licenseKey = generateLicenseKey();
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    const graceEndsAt =
      expiresAt && data.grace_days > 0
        ? new Date(expiresAt.getTime() + data.grace_days * 24 * 60 * 60 * 1000)
        : null;

    const created = await db.license.create({
      data: {
        workspace_id: ctx.workspaceId,
        project_id: data.project_id,
        product_name: data.product_name,
        key_prefix: keyPrefixOf(licenseKey),
        key_hash: hashLicenseKey(licenseKey),
        key_secret: encryptSecret(licenseKey),
        status: "active",
        starts_at: data.starts_at ? new Date(data.starts_at) : new Date(),
        expires_at: expiresAt,
        grace_ends_at: graceEndsAt,
        activation_limit: data.activation_limit,
        auto_suspend: data.auto_suspend,
        features: data.features
          ? data.features.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      },
    });

    await db.$queryRaw`
      INSERT INTO license_events (id, license_id, actor_user_id, type, new_status, occurred_at)
      VALUES (gen_random_uuid(), ${created.id}::uuid, ${ctx.user.id}::uuid, 'issued', 'active', now())
    `;

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "CREATE",
      auditable_type: "license",
      auditable_id: created.id,
      after_data: created,
    });

    revalidatePath("/lisanslar");
    return ok(
      { id: created.id, licenseKey },
      "Lisans üretildi. Anahtarı şimdi kaydedin, tekrar gösterilmeyecek."
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function changeLicenseStatus(
  input: unknown
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = changeStatusSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { license_id, status, reason } = parsed.data;

    const db = await getTenantDb();
    const license = await db.license.findUnique({ where: { id: license_id } });
    if (!license) return fail("Lisans bulunamadı.");
    if (license.status === status) return fail("Lisans zaten bu durumda.");

    const previous = license.status;
    await db.license.update({ where: { id: license_id }, data: { status } });
    await db.$queryRaw`
      INSERT INTO license_events (id, license_id, actor_user_id, type, previous_status, new_status, reason, occurred_at)
      VALUES (gen_random_uuid(), ${license_id}::uuid, ${ctx.user.id}::uuid, 'status_changed', ${previous}::"LicenseStatus", ${status}::"LicenseStatus", ${reason ?? null}, now())
    `;

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "STATUS_CHANGE",
      auditable_type: "license",
      auditable_id: license_id,
      before_data: { status: previous },
      after_data: { status, reason },
    });

    await enqueueLicenseWebhook(license.project_id, license_id, "license.status_changed", {
      license_id,
      previous_status: previous,
      new_status: status,
    });

    revalidatePath("/lisanslar");
    return ok(null, "Lisans durumu güncellendi.");
  } catch (error) {
    return handleError(error);
  }
}

/** 1 yıl yenile. Gelecekteyse mevcut bitişe +1 yıl, geçmişteyse bugünden +1 yıl. */
export async function renewLicense(
  licenseId: string
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.manage");
    const db = await getTenantDb();

    const license = await db.license.findUnique({ where: { id: licenseId } });
    if (!license) return fail("Lisans bulunamadı.");

    // Mükerrer işlem engeli: son 15 saniyede yenileme var mı?
    const recent = await db.$queryRaw<Array<{ occurred_at: Date }>>`
      SELECT occurred_at FROM license_events
      WHERE license_id = ${licenseId}::uuid AND type = 'renewed'
        AND occurred_at > now() - interval '15 seconds'
      LIMIT 1
    `;
    if (recent.length > 0) {
      return fail("Bu lisans az önce yenilendi. Lütfen birkaç saniye bekleyin.");
    }
    void RENEWAL_LOCK_MS;

    const now = Date.now();
    const currentExpiry = license.expires_at?.getTime() ?? 0;
    const base = currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(base + YEAR_MS);

    // Ek süre penceresini koru
    let newGrace: Date | null = null;
    if (license.grace_ends_at && license.expires_at) {
      const graceSpan = license.grace_ends_at.getTime() - license.expires_at.getTime();
      if (graceSpan > 0) newGrace = new Date(newExpiry.getTime() + graceSpan);
    }

    const previousStatus = license.status;
    const newStatus: LicenseStatus =
      license.status === "expired" || license.status === "grace"
        ? "active"
        : license.status;

    await db.license.update({
      where: { id: licenseId },
      data: { expires_at: newExpiry, grace_ends_at: newGrace, status: newStatus },
    });
    await db.$queryRaw`
      INSERT INTO license_events (id, license_id, actor_user_id, type, previous_status, new_status, occurred_at)
      VALUES (gen_random_uuid(), ${licenseId}::uuid, ${ctx.user.id}::uuid, 'renewed', ${previousStatus}::"LicenseStatus", ${newStatus}::"LicenseStatus", now())
    `;

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "RENEW",
      auditable_type: "license",
      auditable_id: licenseId,
      before_data: { expires_at: license.expires_at },
      after_data: { expires_at: newExpiry },
    });

    await enqueueLicenseWebhook(license.project_id, licenseId, "license.renewed", {
      license_id: licenseId,
      expires_at: newExpiry.toISOString(),
    });

    revalidatePath("/lisanslar");
    return ok(null, `Lisans yenilendi. Yeni bitiş: ${newExpiry.toLocaleDateString("tr-TR")}`);
  } catch (error) {
    return handleError(error);
  }
}

/** Anahtarı çöz ve tek seferlik göster (record.manage). */
export async function revealLicenseKey(
  licenseId: string
): Promise<ActionResponse<{ licenseKey: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const db = await getTenantDb();
    const license = await db.license.findUnique({ where: { id: licenseId } });
    if (!license) return fail("Lisans bulunamadı.");

    const licenseKey = decryptSecret(license.key_secret);

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "REVEAL_KEY",
      auditable_type: "license",
      auditable_id: licenseId,
    });

    return ok({ licenseKey });
  } catch (error) {
    return handleError(error);
  }
}

/** Tüm aktivasyonları sıfırla (deaktive et). */
export async function resetActivations(
  licenseId: string
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.manage");
    const db = await getTenantDb();
    const license = await db.license.findUnique({ where: { id: licenseId } });
    if (!license) return fail("Lisans bulunamadı.");

    await db.$queryRaw`
      UPDATE license_activations SET status = 'deactivated', updated_at = now()
      WHERE license_id = ${licenseId}::uuid AND status = 'active'
    `;
    await db.$queryRaw`
      INSERT INTO license_events (id, license_id, actor_user_id, type, occurred_at)
      VALUES (gen_random_uuid(), ${licenseId}::uuid, ${ctx.user.id}::uuid, 'activations_reset', now())
    `;

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "RESET_ACTIVATIONS",
      auditable_type: "license",
      auditable_id: licenseId,
    });

    revalidatePath("/lisanslar");
    return ok(null, "Tüm aktivasyonlar sıfırlandı.");
  } catch (error) {
    return handleError(error);
  }
}

/** Anahtar rotasyonu: yeni anahtar üret, eski hash geçersizleşir, aktivasyonlar deaktive olur. */
export async function rotateLicenseKey(
  licenseId: string
): Promise<ActionResponse<{ licenseKey: string }>> {
  try {
    const ctx = await requirePermission("license.rotate");
    const db = await getTenantDb();
    const license = await db.license.findUnique({ where: { id: licenseId } });
    if (!license) return fail("Lisans bulunamadı.");

    const newKey = generateLicenseKey();

    await db.license.update({
      where: { id: licenseId },
      data: {
        key_prefix: keyPrefixOf(newKey),
        key_hash: hashLicenseKey(newKey),
        key_secret: encryptSecret(newKey),
      },
    });
    await db.$queryRaw`
      UPDATE license_activations SET status = 'deactivated', updated_at = now()
      WHERE license_id = ${licenseId}::uuid AND status = 'active'
    `;
    await db.$queryRaw`
      INSERT INTO license_events (id, license_id, actor_user_id, type, reason, occurred_at)
      VALUES (gen_random_uuid(), ${licenseId}::uuid, ${ctx.user.id}::uuid, 'key_rotated', 'Anahtar rotasyonu', now())
    `;

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "ROTATE_KEY",
      auditable_type: "license",
      auditable_id: licenseId,
    });

    await enqueueLicenseWebhook(license.project_id, licenseId, "license.key_rotated", {
      license_id: licenseId,
    });

    revalidatePath("/lisanslar");
    return ok(
      { licenseKey: newKey },
      "Anahtar döndürüldü. Yeni anahtarı kaydedin; eski anahtar artık geçersiz."
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function addLicenseDomain(
  input: unknown
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = licenseDomainSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { license_id, domain, environment, is_primary } = parsed.data;

    const normalized = normalizeDomain(domain);
    if (!normalized) return fail("Geçersiz domain biçimi.");

    const db = await getTenantDb();
    const license = await db.license.findUnique({ where: { id: license_id } });
    if (!license) return fail("Lisans bulunamadı.");

    try {
      await db.$queryRaw`
        INSERT INTO license_domains (id, license_id, domain, normalized_domain, environment, is_primary, status, created_at, updated_at)
        VALUES (gen_random_uuid(), ${license_id}::uuid, ${domain}, ${normalized}, ${environment}::"DomainEnvironment", ${is_primary}, 'active', now(), now())
      `;
    } catch {
      return fail("Bu domain bu ortam için zaten kayıtlı.");
    }

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "ADD_DOMAIN",
      auditable_type: "license",
      auditable_id: license_id,
      after_data: { domain: normalized, environment },
    });

    revalidatePath("/lisanslar");
    return ok(null, "Domain eklendi.");
  } catch (error) {
    return handleError(error);
  }
}

export async function removeLicenseDomain(
  licenseId: string,
  domainId: string
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.manage");
    const db = await getTenantDb();
    const license = await db.license.findUnique({ where: { id: licenseId } });
    if (!license) return fail("Lisans bulunamadı.");

    await db.$queryRaw`
      DELETE FROM license_domains WHERE id = ${domainId}::uuid AND license_id = ${licenseId}::uuid
    `;

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "REMOVE_DOMAIN",
      auditable_type: "license",
      auditable_id: licenseId,
    });

    revalidatePath("/lisanslar");
    return ok(null, "Domain kaldırıldı.");
  } catch (error) {
    return handleError(error);
  }
}
