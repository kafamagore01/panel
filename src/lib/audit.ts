import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Denetim izi (audit log) yardımcıları.
 * Hassas alanlar before/after JSON'larında [REDACTED] olarak maskelenir.
 */

const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "key_hash",
  "key_secret",
  "webhook_secret",
  "license_webhook_secret",
  "two_factor_secret",
  "code_hash",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value.constructor === Object || value.constructor === undefined)
  );
}

export function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : maskSensitive(val);
    }
    return out;
  }
  return value;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // Date, Prisma.Decimal gibi tipler toJSON üzerinden serileştirilir
  return JSON.parse(JSON.stringify(maskSensitive(value)));
}

export async function getRequestMeta(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip =
      forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    return { ip, userAgent: h.get("user-agent") };
  } catch {
    // Request bağlamı dışında (ör. cron) çağrıldıysa
    return { ip: null, userAgent: null };
  }
}

export type AuditEntry = {
  workspace_id?: string | null;
  actor_user_id?: string | null;
  action: string;
  auditable_type: string;
  auditable_id?: string | null;
  before_data?: unknown;
  after_data?: unknown;
};

/** Denetim kaydı yazar; hata durumunda ana işlemi bloklamaz. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  const { ip, userAgent } = await getRequestMeta();
  try {
    await prisma.auditLog.create({
      data: {
        workspace_id: entry.workspace_id ?? null,
        actor_user_id: entry.actor_user_id ?? null,
        action: entry.action,
        auditable_type: entry.auditable_type,
        auditable_id: entry.auditable_id ?? null,
        before_data: toJson(entry.before_data),
        after_data: toJson(entry.after_data),
        ip_address: ip,
        user_agent: userAgent,
      },
    });
  } catch (error) {
    console.error("Denetim kaydı yazılamadı:", error);
  }
}
