import { prisma } from "@/lib/db/prisma";

const BATCH_SIZE = 1_000;

function configuredDays(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const days = Number(raw);
  return Number.isInteger(days) && days >= 1 && days <= 3_650
    ? days
    : null;
}

function count(rows: Array<{ count: bigint }>): number {
  return Number(rows[0]?.count ?? 0);
}

/**
 * Kesin olarak geçersiz auth kayıtlarını temizler. İş/audit retention'ı ürün
 * politikasına bağlı olduğundan yalnız ilgili *_RETENTION_DAYS tanımlıysa siler.
 */
export async function runRetentionMaintenance(): Promise<{
  sessions: number;
  otpCodes: number;
  webhookDeliveries: number;
  auditLogs: number;
  licenseEvents: number;
}> {
  const now = new Date();
  const otpCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const sessions = count(await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH targets AS (
      SELECT id
      FROM sessions
      WHERE expires < ${now}
         OR absolute_expires_at < ${now}
      ORDER BY expires ASC
      LIMIT ${BATCH_SIZE}
    ), deleted AS (
      DELETE FROM sessions
      WHERE id IN (SELECT id FROM targets)
      RETURNING 1
    )
    SELECT COUNT(*)::bigint AS count FROM deleted
  `);

  const otpCodes = count(await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH targets AS (
      SELECT id
      FROM otp_codes
      WHERE expires_at < ${otpCutoff}
      ORDER BY expires_at ASC
      LIMIT ${BATCH_SIZE}
    ), deleted AS (
      DELETE FROM otp_codes
      WHERE id IN (SELECT id FROM targets)
      RETURNING 1
    )
    SELECT COUNT(*)::bigint AS count FROM deleted
  `);

  let webhookDeliveries = 0;
  const webhookDays = configuredDays("WEBHOOK_RETENTION_DAYS");
  if (webhookDays) {
    const cutoff = new Date(now.getTime() - webhookDays * 86_400_000);
    webhookDeliveries = count(
      await prisma.$queryRaw<Array<{ count: bigint }>>`
        WITH targets AS (
          SELECT id
          FROM webhook_deliveries
          WHERE status IN ('delivered', 'failed')
            AND next_publish_at IS NULL
            AND updated_at < ${cutoff}
          ORDER BY updated_at ASC
          LIMIT ${BATCH_SIZE}
        ), deleted AS (
          DELETE FROM webhook_deliveries
          WHERE id IN (SELECT id FROM targets)
          RETURNING 1
        )
        SELECT COUNT(*)::bigint AS count FROM deleted
      `
    );
  }

  let auditLogs = 0;
  const auditDays = configuredDays("AUDIT_RETENTION_DAYS");
  if (auditDays) {
    const cutoff = new Date(now.getTime() - auditDays * 86_400_000);
    auditLogs = count(await prisma.$queryRaw<Array<{ count: bigint }>>`
      WITH targets AS (
        SELECT id
        FROM audit_logs
        WHERE created_at < ${cutoff}
        ORDER BY created_at ASC
        LIMIT ${BATCH_SIZE}
      ), deleted AS (
        DELETE FROM audit_logs
        WHERE id IN (SELECT id FROM targets)
        RETURNING 1
      )
      SELECT COUNT(*)::bigint AS count FROM deleted
    `);
  }

  let licenseEvents = 0;
  const eventDays = configuredDays("LICENSE_EVENT_RETENTION_DAYS");
  if (eventDays) {
    const cutoff = new Date(now.getTime() - eventDays * 86_400_000);
    licenseEvents = count(await prisma.$queryRaw<Array<{ count: bigint }>>`
      WITH targets AS (
        SELECT id
        FROM license_events
        WHERE occurred_at < ${cutoff}
        ORDER BY occurred_at ASC
        LIMIT ${BATCH_SIZE}
      ), deleted AS (
        DELETE FROM license_events
        WHERE id IN (SELECT id FROM targets)
        RETURNING 1
      )
      SELECT COUNT(*)::bigint AS count FROM deleted
    `);
  }

  return {
    sessions,
    otpCodes,
    webhookDeliveries,
    auditLogs,
    licenseEvents,
  };
}
