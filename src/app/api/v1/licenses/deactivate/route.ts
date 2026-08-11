import { NextResponse, type NextRequest } from "next/server";
import {
  activationTokenMatches,
  hashLicenseKey,
  LICENSE_KEY_REGEX,
} from "@/lib/crypto/license-key";
import { prisma } from "@/lib/db/prisma";
import { limitDeactivateApi } from "@/lib/security/rate-limit";
import { deactivateLicenseApiSchema } from "@/lib/validation/license-api";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
}

function json(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const limit = await limitDeactivateApi(clientIp(req));
  if (!limit.success) {
    return NextResponse.json(
      { deactivated: false, error: "rate_limited" },
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
    return json(422, { deactivated: false, error: "invalid_body" });
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return json(413, { deactivated: false, error: "body_too_large" });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody);
  } catch {
    return json(422, { deactivated: false, error: "invalid_body" });
  }
  const parsed = deactivateLicenseApiSchema.safeParse(decoded);
  if (!parsed.success) {
    return json(422, { deactivated: false, error: "invalid_body" });
  }

  const licenseKey = parsed.data.license_key.toUpperCase();
  if (!LICENSE_KEY_REGEX.test(licenseKey)) {
    return json(422, { deactivated: false, error: "invalid_key_format" });
  }

  try {
    const license = await prisma.license.findUnique({
      where: { key_hash: hashLicenseKey(licenseKey) },
      select: { id: true },
    });
    if (!license) return json(404, { deactivated: false, error: "not_found" });

    const activation = await prisma.licenseActivation.findUnique({
      where: {
        license_id_instance_id: {
          license_id: license.id,
          instance_id: parsed.data.instance_id,
        },
      },
      select: { id: true, status: true, activation_token_hash: true },
    });
    if (
      !activation?.activation_token_hash ||
      !activationTokenMatches(
        activation.activation_token_hash,
        parsed.data.activation_token
      )
    ) {
      return json(403, {
        deactivated: false,
        error: "invalid_activation_token",
      });
    }

    const result = await prisma.licenseActivation.updateMany({
      where: { id: activation.id, status: "active" },
      data: { status: "deactivated" },
    });

    // Geçerli tokenla yinelenen bırakma isteği güvenle 200 döner.
    return json(200, { deactivated: true, released: result.count });
  } catch (error) {
    console.error("Aktivasyon bırakma hatası:", error);
    return json(500, { deactivated: false, error: "server_error" });
  }
}
