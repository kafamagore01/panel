import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashLicenseKey, LICENSE_KEY_REGEX } from "@/lib/crypto/license-key";
import { normalizeDomain } from "@/lib/domain";
import { limitValidateApi } from "@/lib/security/rate-limit";
import { recordValidationFailure } from "@/lib/licenses/validation-log";

export const dynamic = "force-dynamic";

/**
 * Genel Lisans Doğrulama API'si.
 * POST /api/v1/licenses/validate
 *
 * Akış (DB transaction + row lock ile):
 *  1. Rate limit (IP başına 60/dk)
 *  2. Girdi + anahtar biçimi + domain normalizasyonu (422)
 *  3. HMAC hash ile lisans arama (404)
 *  4. Aktif domain eşleşmesi (403, detaysız)
 *  5. Durum kontrolleri — yalnızca active/grace kabul edilir; tarih bazlı
 *     ek süre (grace) değerlendirmesi ayrıca yapılır
 *  6. Aktivasyon limiti + upsert
 *  7. last_validated_at güncelle → 200
 *
 * Başarısız doğrulamalar (lisans bulunduysa) license_events'e yazılır.
 */

const bodySchema = z.object({
  license_key: z.string().min(1),
  domain: z.string().min(1),
  instance_id: z.string().max(200).optional(),
  app_version: z.string().max(50).optional(),
});

/** API'nin geçerli saydığı DB durumları; diğerleri doğrulamayı reddeder. */
const ACCEPTED_STATUSES = new Set(["active", "grace"]);

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
}

function deny(status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { valid: false, error: code, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

type LockedLicense = {
  id: string;
  workspace_id: string;
  project_id: string;
  product_name: string;
  status: string;
  starts_at: Date | null;
  expires_at: Date | null;
  grace_ends_at: Date | null;
  activation_limit: number;
  features: unknown;
};

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // 1) Rate limit
  const limit = await limitValidateApi(ip);
  if (!limit.success) {
    return NextResponse.json(
      { valid: false, error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000))),
        },
      }
    );
  }

  // 2) Girdi
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return deny(422, "invalid_body");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return deny(422, "invalid_body");

  // Biçimi hatalı anahtarlar DB'ye hiç gitmez
  if (!LICENSE_KEY_REGEX.test(parsed.data.license_key.trim().toUpperCase())) {
    return deny(422, "invalid_key_format");
  }

  const normalized = normalizeDomain(parsed.data.domain);
  if (!normalized) return deny(422, "invalid_domain");

  const keyHash = hashLicenseKey(parsed.data.license_key.trim().toUpperCase());
  const now = new Date();

  type ValidateResult =
    | { http: 200; payload: Record<string, unknown> }
    | { http: number; code: string; licenseId?: string };

  try {
    const result = await prisma.$transaction(async (tx): Promise<ValidateResult> => {
      // 3) Row-lock ile lisansı hash üzerinden bul
      const rows = await tx.$queryRaw<LockedLicense[]>`
        SELECT id, workspace_id, project_id, product_name, status::text AS status,
               starts_at, expires_at, grace_ends_at, activation_limit, features
        FROM licenses
        WHERE key_hash = ${keyHash}
        FOR UPDATE
      `;
      const license = rows[0];
      if (!license) return { http: 404, code: "not_found" as const };

      // 4) Aktif domain eşleşmesi (detaysız; pasif kayıtlar eşleşmez)
      const domainRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM license_domains
        WHERE license_id = ${license.id}::uuid
          AND normalized_domain = ${normalized}
          AND status = 'active'
        LIMIT 1
      `;
      if (domainRows.length === 0) {
        return { http: 403, code: "domain_mismatch" as const, licenseId: license.id };
      }
      const domainId = domainRows[0].id;

      // 5) Durum kontrolleri — beyaz liste dışındaki her durum reddedilir
      if (!ACCEPTED_STATUSES.has(license.status)) {
        const code =
          license.status === "suspended"
            ? "suspended"
            : license.status === "revoked"
              ? "revoked"
              : license.status === "pending"
                ? "pending"
                : "expired";
        return { http: 403, code, licenseId: license.id };
      }

      if (license.starts_at && license.starts_at > now) {
        return { http: 403, code: "not_started" as const, licenseId: license.id };
      }

      let inGrace = false;
      if (license.expires_at && license.expires_at < now) {
        const graceEnd = license.grace_ends_at;
        if (graceEnd && graceEnd >= now) {
          inGrace = true;
        } else {
          return { http: 403, code: "expired" as const, licenseId: license.id };
        }
      }

      // 6) Aktivasyon + limit
      if (parsed.data.instance_id) {
        const instanceId = parsed.data.instance_id;
        const existing = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT id, status::text AS status FROM license_activations
          WHERE license_id = ${license.id}::uuid AND instance_id = ${instanceId}
          LIMIT 1
        `;
        const isNewInstance = existing.length === 0 || existing[0].status !== "active";

        if (isNewInstance) {
          const activeCountRows = await tx.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::bigint AS count FROM license_activations
            WHERE license_id = ${license.id}::uuid AND status = 'active'
          `;
          const activeCount = Number(activeCountRows[0]?.count ?? 0);
          if (activeCount >= license.activation_limit) {
            return {
              http: 403,
              code: "activation_limit_exceeded" as const,
              licenseId: license.id,
            };
          }
        }

        // upsert (instance_id benzersiz)
        await tx.$queryRaw`
          INSERT INTO license_activations
            (id, license_id, license_domain_id, instance_id, status, first_seen_at, last_seen_at, last_ip, app_version, created_at, updated_at)
          VALUES
            (gen_random_uuid(), ${license.id}::uuid, ${domainId}::uuid, ${instanceId}, 'active', ${now}, ${now}, ${ip}, ${parsed.data.app_version ?? null}, ${now}, ${now})
          ON CONFLICT (license_id, instance_id)
          DO UPDATE SET status = 'active', last_seen_at = ${now}, last_ip = ${ip},
                        app_version = ${parsed.data.app_version ?? null},
                        license_domain_id = ${domainId}::uuid, updated_at = ${now}
        `;
      }

      // 7) last_validated_at
      await tx.$queryRaw`
        UPDATE licenses SET last_validated_at = ${now} WHERE id = ${license.id}::uuid
      `;

      const effectiveStatus = inGrace ? "grace" : license.status;
      const features = Array.isArray(license.features) ? license.features : [];

      return {
        http: 200,
        payload: {
          valid: true,
          status: effectiveStatus,
          domain: normalized,
          product: license.product_name,
          expires_at: license.expires_at ? license.expires_at.toISOString() : null,
          grace_ends_at: license.grace_ends_at ? license.grace_ends_at.toISOString() : null,
          in_grace_period: inGrace,
          features,
          checked_at: now.toISOString(),
        },
      };
    });

    if (result.http === 200 && "payload" in result) {
      return NextResponse.json(result.payload, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // not: "code" in result kontrolü, 200 dışı tüm dalların code taşıdığını garanti eder
    const code = "code" in result ? result.code : "error";
    if ("licenseId" in result && result.licenseId) {
      await recordValidationFailure(result.licenseId, code);
    }
    return deny(result.http, code);
  } catch (error) {
    console.error("Lisans doğrulama hatası:", error);
    return deny(500, "server_error");
  }
}
