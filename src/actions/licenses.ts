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
  domainStatusSchema,
} from "@/lib/validation/license";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";
import { enqueueLicenseWebhook } from "@/lib/queue/webhook-dispatch";

/** Aynı lisansın bu süre içinde ikinci kez yenilenmesi engellenir. */
const RENEWAL_LOCK_MS = 15_000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  console.error(error);
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

    await db.licenseEvent.create({
      data: {
        license_id: created.id,
        actor_user_id: ctx.user.id,
        type: "issued",
        new_status: "active",
      },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "CREATE",
      auditable_type: "license",
      auditable_id: created.id,
      after_data: created,
    });

    await enqueueLicenseWebhook(data.project_id, created.id, "license.issued", {
      license_id: created.id,
      product: created.product_name,
      status: created.status,
      expires_at: created.expires_at?.toISOString() ?? null,
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

    // Cron'un anında geri alacağı ya da anlamsız olan geçişleri baştan engelle:
    // durum ile tarih alanları tutarsız kalırsa lisans "aktif" görünüp doğrulamada
    // reddedilir.
    const now = new Date();
    const expired = Boolean(license.expires_at && license.expires_at < now);

    if (status === "active" && expired) {
      return fail(
        "Süresi dolmuş lisans doğrudan aktife alınamaz. Önce lisansı yenileyin."
      );
    }
    if (
      status === "grace" &&
      !(license.grace_ends_at && license.grace_ends_at >= now)
    ) {
      return fail(
        "Ek süre penceresi tanımlı değil veya dolmuş. Önce lisansı yenileyin."
      );
    }

    const previous = license.status;
    await db.license.update({ where: { id: license_id }, data: { status } });
    await db.licenseEvent.create({
      data: {
        license_id,
        actor_user_id: ctx.user.id,
        type: "status_changed",
        previous_status: previous,
        new_status: status,
        reason: reason ?? null,
      },
    });

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

    // Mükerrer işlem engeli: kilit penceresinde yenileme var mı?
    const recent = await db.licenseEvent.findFirst({
      where: {
        license_id: licenseId,
        type: "renewed",
        occurred_at: { gt: new Date(Date.now() - RENEWAL_LOCK_MS) },
      },
      select: { id: true },
    });
    if (recent) {
      return fail("Bu lisans az önce yenilendi. Lütfen birkaç saniye bekleyin.");
    }

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
    // Süre dolduğu için düşülen durumlar yenilemeyle geri açılır. auto_suspend ile
    // otomatik askıya alınmış lisanslar da buraya girer; elle askıya alınmış
    // (auto_suspend kapalı) lisanslar askıda kalır — bunlar iş kararıdır.
    const reactivatable =
      previousStatus === "expired" ||
      previousStatus === "grace" ||
      (previousStatus === "suspended" && license.auto_suspend && currentExpiry > 0 && currentExpiry < now);
    const newStatus: LicenseStatus = reactivatable ? "active" : previousStatus;

    await db.license.update({
      where: { id: licenseId },
      data: { expires_at: newExpiry, grace_ends_at: newGrace, status: newStatus },
    });
    await db.licenseEvent.create({
      data: {
        license_id: licenseId,
        actor_user_id: ctx.user.id,
        type: "renewed",
        previous_status: previousStatus,
        new_status: newStatus,
      },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "RENEW",
      auditable_type: "license",
      auditable_id: licenseId,
      before_data: { expires_at: license.expires_at, status: previousStatus },
      after_data: { expires_at: newExpiry, status: newStatus },
    });

    await enqueueLicenseWebhook(license.project_id, licenseId, "license.renewed", {
      license_id: licenseId,
      expires_at: newExpiry.toISOString(),
      grace_ends_at: newGrace?.toISOString() ?? null,
      previous_status: previousStatus,
      new_status: newStatus,
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

    const reset = await db.licenseActivation.updateMany({
      where: { license_id: licenseId, status: "active" },
      data: { status: "deactivated" },
    });
    await db.licenseEvent.create({
      data: {
        license_id: licenseId,
        actor_user_id: ctx.user.id,
        type: "activations_reset",
        reason: `${reset.count} aktivasyon sıfırlandı.`,
      },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "RESET_ACTIVATIONS",
      auditable_type: "license",
      auditable_id: licenseId,
      after_data: { reset_count: reset.count },
    });

    await enqueueLicenseWebhook(
      license.project_id,
      licenseId,
      "license.activations_reset",
      { license_id: licenseId, reset_count: reset.count }
    );

    revalidatePath("/lisanslar");
    return ok(null, `${reset.count} aktivasyon sıfırlandı.`);
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
    await db.licenseActivation.updateMany({
      where: { license_id: licenseId, status: "active" },
      data: { status: "deactivated" },
    });
    await db.licenseEvent.create({
      data: {
        license_id: licenseId,
        actor_user_id: ctx.user.id,
        type: "key_rotated",
        reason: "Anahtar rotasyonu",
      },
    });

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

    // İlk domain her zaman birincil olur; birincil seçimi tekilleştirilir.
    const existingCount = await db.licenseDomain.count({ where: { license_id } });
    const makePrimary = is_primary || existingCount === 0;

    try {
      await db.$transaction(async (tx) => {
        if (makePrimary) {
          await tx.licenseDomain.updateMany({
            where: { license_id, is_primary: true },
            data: { is_primary: false },
          });
        }
        await tx.licenseDomain.create({
          data: {
            license_id,
            domain,
            normalized_domain: normalized,
            environment,
            is_primary: makePrimary,
            status: "active",
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail("Bu domain bu ortam için zaten kayıtlı.");
      }
      throw error;
    }

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "ADD_DOMAIN",
      auditable_type: "license",
      auditable_id: license_id,
      after_data: { domain: normalized, environment, is_primary: makePrimary },
    });

    revalidatePath("/lisanslar");
    return ok(null, "Domain eklendi.");
  } catch (error) {
    return handleError(error);
  }
}

/** Domaini silmeden doğrulama dışı bırakır (aktivasyon geçmişi korunur). */
export async function setLicenseDomainStatus(
  input: unknown
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = domainStatusSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { license_id, domain_id, status } = parsed.data;

    const db = await getTenantDb();
    const license = await db.license.findUnique({ where: { id: license_id } });
    if (!license) return fail("Lisans bulunamadı.");

    const updated = await db.licenseDomain.updateMany({
      where: { id: domain_id, license_id },
      data: { status },
    });
    if (updated.count === 0) return fail("Domain bulunamadı.");

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "UPDATE_DOMAIN_STATUS",
      auditable_type: "license",
      auditable_id: license_id,
      after_data: { domain_id, status },
    });

    revalidatePath("/lisanslar");
    return ok(
      null,
      status === "active" ? "Domain yeniden etkinleştirildi." : "Domain pasife alındı."
    );
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

    const target = await db.licenseDomain.findFirst({
      where: { id: domainId, license_id: licenseId },
      select: { id: true, normalized_domain: true, is_primary: true },
    });
    if (!target) return fail("Domain bulunamadı.");

    await db.licenseDomain.delete({ where: { id: target.id } });

    // Birincil domain silindiyse en eski kayıt birincil olur.
    if (target.is_primary) {
      const next = await db.licenseDomain.findFirst({
        where: { license_id: licenseId },
        orderBy: { created_at: "asc" },
        select: { id: true },
      });
      if (next) {
        await db.licenseDomain.update({
          where: { id: next.id },
          data: { is_primary: true },
        });
      }
    }

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "REMOVE_DOMAIN",
      auditable_type: "license",
      auditable_id: licenseId,
      before_data: { domain: target.normalized_domain, is_primary: target.is_primary },
    });

    revalidatePath("/lisanslar");
    return ok(null, "Domain kaldırıldı.");
  } catch (error) {
    return handleError(error);
  }
}
