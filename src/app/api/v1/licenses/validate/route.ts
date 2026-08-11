import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  activationTokenMatches,
  generateActivationToken,
  hashActivationToken,
  hashLicenseKey,
  LICENSE_KEY_REGEX,
} from "@/lib/crypto/license-key";
import { normalizeDomain } from "@/lib/domain";
import { evaluateLicenseState, licenseLease } from "@/lib/licenses/policy";
import { recordValidationFailure } from "@/lib/licenses/validation-log";
import { limitValidateApi } from "@/lib/security/rate-limit";
import { validateLicenseApiSchema } from "@/lib/validation/license-api";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_192;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
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

type ValidateResult =
  | { http: 200; payload: Record<string, unknown> }
  | { http: number; code: string; licenseId?: string };

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
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

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return deny(422, "invalid_body");
  }
  if (rawBody.length > MAX_BODY_BYTES) return deny(413, "body_too_large");

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody);
  } catch {
    return deny(422, "invalid_body");
  }
  const parsed = validateLicenseApiSchema.safeParse(decoded);
  if (!parsed.success) return deny(422, "invalid_body");

  const licenseKey = parsed.data.license_key.toUpperCase();
  if (!LICENSE_KEY_REGEX.test(licenseKey)) return deny(422, "invalid_key_format");

  const normalizedDomain = normalizeDomain(parsed.data.domain);
  if (!normalizedDomain) return deny(422, "invalid_domain");

  const keyHash = hashLicenseKey(licenseKey);
  const now = new Date();

  try {
    const result = await prisma.$transaction(
      async (tx): Promise<ValidateResult> => {
        // Lisans satırı kilidi aynı lisansa gelen paralel aktivasyonların limiti aşmasını önler.
        const rows = await tx.$queryRaw<LockedLicense[]>`
          SELECT id, workspace_id, project_id, product_name, status::text AS status,
                 starts_at, expires_at, grace_ends_at, activation_limit, features
          FROM licenses
          WHERE key_hash = ${keyHash}
          FOR UPDATE
        `;
        const license = rows[0];
        if (!license) return { http: 404, code: "not_found" };

        const licenseDomain = await tx.licenseDomain.findFirst({
          where: {
            license_id: license.id,
            normalized_domain: normalizedDomain,
            environment: parsed.data.environment,
            status: "active",
          },
          select: { id: true },
        });
        if (!licenseDomain) {
          return { http: 403, code: "domain_mismatch", licenseId: license.id };
        }

        const state = evaluateLicenseState(
          {
            status: license.status,
            startsAt: license.starts_at,
            expiresAt: license.expires_at,
            graceEndsAt: license.grace_ends_at,
          },
          now
        );
        if (!state.valid) {
          return { http: 403, code: state.code, licenseId: license.id };
        }

        const existing = await tx.licenseActivation.findUnique({
          where: {
            license_id_instance_id: {
              license_id: license.id,
              instance_id: parsed.data.instance_id,
            },
          },
          select: {
            id: true,
            status: true,
            license_domain_id: true,
            activation_token_hash: true,
          },
        });

        const isActive = existing?.status === "active";
        if (
          isActive &&
          existing.license_domain_id &&
          existing.license_domain_id !== licenseDomain.id
        ) {
          return {
            http: 403,
            code: "activation_domain_mismatch",
            licenseId: license.id,
          };
        }

        let issuedActivationToken: string | null = null;
        if (isActive && existing.activation_token_hash) {
          if (!parsed.data.activation_token) {
            return {
              http: 403,
              code: "activation_token_required",
              licenseId: license.id,
            };
          }
          if (
            !activationTokenMatches(
              existing.activation_token_hash,
              parsed.data.activation_token
            )
          ) {
            return {
              http: 403,
              code: "invalid_activation_token",
              licenseId: license.id,
            };
          }
        } else {
          if (!isActive) {
            const activeCount = await tx.licenseActivation.count({
              where: { license_id: license.id, status: "active" },
            });
            if (activeCount >= license.activation_limit) {
              return {
                http: 403,
                code: "activation_limit_exceeded",
                licenseId: license.id,
              };
            }
          }
          // Yeni, yeniden etkinleşen veya eski tokensız aktivasyona bir sır verilir.
          issuedActivationToken = generateActivationToken();
        }

        const activationTokenHash = issuedActivationToken
          ? hashActivationToken(issuedActivationToken)
          : existing?.activation_token_hash;

        await tx.licenseActivation.upsert({
          where: {
            license_id_instance_id: {
              license_id: license.id,
              instance_id: parsed.data.instance_id,
            },
          },
          create: {
            license_id: license.id,
            license_domain_id: licenseDomain.id,
            instance_id: parsed.data.instance_id,
            activation_token_hash: activationTokenHash,
            status: "active",
            first_seen_at: now,
            last_seen_at: now,
            last_ip: ip,
            app_version: parsed.data.app_version ?? null,
          },
          update: {
            license_domain_id: licenseDomain.id,
            activation_token_hash: activationTokenHash,
            status: "active",
            last_seen_at: now,
            last_ip: ip,
            app_version: parsed.data.app_version ?? null,
          },
        });

        await tx.license.update({
          where: { id: license.id },
          data: { last_validated_at: now },
        });

        const features = Array.isArray(license.features) ? license.features : [];
        return {
          http: 200,
          payload: {
            valid: true,
            status: state.status,
            domain: normalizedDomain,
            environment: parsed.data.environment,
            instance_id: parsed.data.instance_id,
            product: license.product_name,
            expires_at: license.expires_at?.toISOString() ?? null,
            grace_ends_at: license.grace_ends_at?.toISOString() ?? null,
            in_grace_period: state.inGrace,
            features,
            checked_at: now.toISOString(),
            ...licenseLease(now),
            ...(issuedActivationToken
              ? { activation_token: issuedActivationToken }
              : {}),
          },
        };
      },
      { maxWait: 5_000, timeout: 15_000 }
    );

    if ("payload" in result) {
      return NextResponse.json(result.payload, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (result.licenseId) {
      await recordValidationFailure(result.licenseId, result.code);
    }
    return deny(result.http, result.code);
  } catch (error) {
    console.error("Lisans doğrulama hatası:", error);
    return deny(500, "server_error");
  }
}
