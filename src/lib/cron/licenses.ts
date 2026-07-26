import type { LicenseStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  enqueueLicenseWebhook,
  reconcileWebhookDeliveries,
} from "@/lib/queue/webhook-dispatch";

/**
 * Lisans durum senkronizasyonu:
 *  - Süresi dolmuş ama ek süre içindekiler → grace
 *  - Ek süresi de dolmuş / ek süresi olmayanlar → expired (auto_suspend ise suspended)
 *  - Uzun süredir görülmeyen aktivasyonlar → deactivated (koltuk iadesi)
 *  - Gecikmiş faturaların işaretlenmesi ayrı ele alınır
 *
 * Her otomatik durum değişikliği `license_events` tablosuna `status_changed`
 * olarak yazılır ve projenin webhook adresine bildirilir — panelden yapılan
 * elle değişikliklerle aynı iz ve bildirim garantisi sağlanır.
 */

/** Bir koşum başına işlenecek azami lisans sayısı; kalanı sonraki koşuma kalır. */
const BATCH_SIZE = 500;

/** Bu kadar gün görülmeyen aktivasyon koltuğu otomatik serbest bırakılır. */
const ACTIVATION_STALE_DAYS = 90;

/** Webhook kuyruklaması eşzamanlılığı (cron süre limitini korumak için). */
const WEBHOOK_CHUNK = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

type Candidate = {
  id: string;
  project_id: string;
  status: LicenseStatus;
  expires_at: Date | null;
  grace_ends_at: Date | null;
};

async function enqueueAll(
  candidates: Candidate[],
  eventType: string,
  newStatus: LicenseStatus
): Promise<void> {
  for (let i = 0; i < candidates.length; i += WEBHOOK_CHUNK) {
    const chunk = candidates.slice(i, i + WEBHOOK_CHUNK);
    await Promise.allSettled(
      chunk.map((license) =>
        enqueueLicenseWebhook(license.project_id, license.id, eventType, {
          license_id: license.id,
          previous_status: license.status,
          new_status: newStatus,
          expires_at: license.expires_at?.toISOString() ?? null,
          grace_ends_at: license.grace_ends_at?.toISOString() ?? null,
        })
      )
    );
  }
}

/** Verilen koşulu sağlayan lisansları yeni duruma taşır, olay + webhook üretir. */
async function syncTransition(params: {
  from: LicenseStatus[];
  to: LicenseStatus;
  where: Prisma.LicenseWhereInput;
  eventType: string;
  reason: string;
}): Promise<number> {
  const candidates = (await prisma.license.findMany({
    where: { status: { in: params.from }, ...params.where },
    select: {
      id: true,
      project_id: true,
      status: true,
      expires_at: true,
      grace_ends_at: true,
    },
    take: BATCH_SIZE,
  })) as Candidate[];

  if (candidates.length === 0) return 0;

  const { count } = await prisma.license.updateMany({
    where: { id: { in: candidates.map((c) => c.id) }, status: { in: params.from } },
    data: { status: params.to },
  });
  if (count === 0) return 0;

  await prisma.licenseEvent.createMany({
    data: candidates.map((license) => ({
      license_id: license.id,
      type: "status_changed" as const,
      previous_status: license.status,
      new_status: params.to,
      reason: params.reason,
    })),
  });

  await enqueueAll(candidates, params.eventType, params.to);
  return count;
}

export async function runLicenseCron(): Promise<{
  toGrace: number;
  toExpired: number;
  toSuspended: number;
  staleActivations: number;
  overdueInvoices: number;
  webhookOutbox: { found: number; published: number };
}> {
  const now = new Date();

  // 1) active → grace (expires geçti, grace penceresi devam ediyor)
  const toGrace = await syncTransition({
    from: ["active"],
    to: "grace",
    where: { expires_at: { lt: now }, grace_ends_at: { gte: now } },
    eventType: "license.grace_started",
    reason: "Otomatik: süre doldu, ek süre başladı.",
  });

  // 2) active/grace → expired (ek süre yok veya bitti), auto_suspend kapalı
  const toExpired = await syncTransition({
    from: ["active", "grace"],
    to: "expired",
    where: {
      expires_at: { lt: now },
      auto_suspend: false,
      OR: [{ grace_ends_at: null }, { grace_ends_at: { lt: now } }],
    },
    eventType: "license.expired",
    reason: "Otomatik: lisans süresi doldu.",
  });

  // 3) auto_suspend açık ve süresi/ek süresi dolmuşlar → suspended
  const toSuspended = await syncTransition({
    from: ["active", "grace"],
    to: "suspended",
    where: {
      expires_at: { lt: now },
      auto_suspend: true,
      OR: [{ grace_ends_at: null }, { grace_ends_at: { lt: now } }],
    },
    eventType: "license.suspended",
    reason: "Otomatik: süre doldu, otomatik askıya alma etkin.",
  });

  // 4) Uzun süredir doğrulama yapmayan kurulumların koltuğunu serbest bırak
  const stale = await prisma.licenseActivation.updateMany({
    where: {
      status: "active",
      last_seen_at: { lt: new Date(now.getTime() - ACTIVATION_STALE_DAYS * DAY_MS) },
    },
    data: { status: "deactivated" },
  });

  // 5) Vadesi geçmiş faturaları işaretle
  const overdue = await prisma.invoice.updateMany({
    where: {
      status: { in: ["issued", "partial"] },
      due_on: { lt: now },
      balance_due: { gt: 0 },
    },
    data: { status: "overdue" },
  });
  const webhookOutbox = await reconcileWebhookDeliveries();

  return {
    toGrace,
    toExpired,
    toSuspended,
    staleActivations: stale.count,
    overdueInvoices: overdue.count,
    webhookOutbox,
  };
}
