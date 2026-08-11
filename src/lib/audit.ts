import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import crypto from "node:crypto";
import { logError } from "@/lib/logger";

/**
 * Denetim izi (audit log) yardımcıları.
 * Hassas alanlar before/after JSON'larında [REDACTED] olarak maskelenir.
 */

const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "ssh_password",
  "ssh_password_encrypted",
  "key_hash",
  "key_secret",
  "webhook_secret",
  "license_webhook_secret",
  "two_factor_secret",
  "code_hash",
  "access_token",
  "token",
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
  requestId: string;
}> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip =
      forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    const incomingRequestId = h.get("x-request-id");
    const requestId =
      incomingRequestId &&
      incomingRequestId.length <= 128 &&
      /^[A-Za-z0-9._:-]+$/.test(incomingRequestId)
        ? incomingRequestId
        : crypto.randomUUID();
    return { ip, userAgent: h.get("user-agent"), requestId };
  } catch {
    // Request bağlamı dışında (ör. cron) çağrıldıysa
    return {
      ip: null,
      userAgent: null,
      requestId: crypto.randomUUID(),
    };
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
  request_id?: string | null;
};

/** Denetim kaydı yazar; hata durumunda ana işlemi bloklamaz. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  const { ip, userAgent, requestId } = await getRequestMeta();
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
        request_id: entry.request_id ?? requestId,
      },
    });
  } catch (error) {
    logError("security.audit_write_failed", error, {
      request_id: entry.request_id ?? requestId,
      workspace_id: entry.workspace_id ?? null,
      actor_user_id: entry.actor_user_id ?? null,
      action: entry.action,
      auditable_type: entry.auditable_type,
    });
  }
}
