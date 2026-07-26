import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashLicenseKey, LICENSE_KEY_REGEX } from "@/lib/crypto/license-key";
import { limitDeactivateApi } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Aktivasyon bırakma (koltuk iadesi) API'si.
 * POST /api/v1/licenses/deactivate
 *
 * Sunucu değiştiren veya kurulumu kaldıran istemci, kullandığı koltuğu bu uçla
 * serbest bırakır. Aksi hâlde aktivasyon limiti dolduğunda yalnızca panelden
 * "Aktivasyonları Sıfırla" ile kurtarılabilirdi.
 *
 * Yanıt kodları: 200 bırakıldı, 404 not_found, 422 invalid_body /
 * invalid_key_format, 429 rate_limited.
 */

const bodySchema = z.object({
  license_key: z.string().min(1),
  instance_id: z.string().min(1).max(200),
});

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(422, { deactivated: false, error: "invalid_body" });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json(422, { deactivated: false, error: "invalid_body" });
  }

  const licenseKey = parsed.data.license_key.trim().toUpperCase();
  if (!LICENSE_KEY_REGEX.test(licenseKey)) {
    return json(422, { deactivated: false, error: "invalid_key_format" });
  }

  try {
    const license = await prisma.license.findUnique({
      where: { key_hash: hashLicenseKey(licenseKey) },
      select: { id: true },
    });
    if (!license) return json(404, { deactivated: false, error: "not_found" });

    const result = await prisma.licenseActivation.updateMany({
      where: {
        license_id: license.id,
        instance_id: parsed.data.instance_id,
        status: "active",
      },
      data: { status: "deactivated" },
    });

    // Zaten pasif ya da hiç var olmayan bir kurulum için de 200 döneriz:
    // istemci tarafında tekrar denemek güvenli olmalıdır (idempotent).
    return json(200, { deactivated: true, released: result.count });
  } catch (error) {
    console.error("Aktivasyon bırakma hatası:", error);
    return json(500, { deactivated: false, error: "server_error" });
  }
}
