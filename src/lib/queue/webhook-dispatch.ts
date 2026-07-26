import crypto from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getQStash, appBaseUrl } from "./qstash";
import { logError } from "@/lib/logger";

const REPUBLISH_AFTER_MS = 5 * 60 * 1000;
const PUBLISH_BACKOFF_MS = 60 * 1000;
const STALE_PROCESSING_MS = 2 * 60 * 1000;
const RECONCILE_BATCH_SIZE = 100;
const QSTASH_PUBLISH_TIMEOUT_MS = 8_000;

async function withPublishTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("QStash publish zaman aşımına uğradı.")),
          QSTASH_PUBLISH_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Lisans mutasyonuyla aynı transaction içinde kalıcı outbox kaydı oluşturur.
 * Dış kuyruk yayını commit sonrasında yapılır; yayın düşerse kayıt kaybolmaz.
 */
export async function createLicenseWebhookDelivery(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  projectId: string,
  licenseId: string | null,
  eventType: string,
  payload: Record<string, unknown>
): Promise<string | null> {
  const project = await tx.project.findFirst({
    where: { id: projectId, workspace_id: workspaceId },
    select: { id: true, workspace_id: true, license_webhook_url: true },
  });
  if (!project?.license_webhook_url) return null;

  const delivery = await tx.webhookDelivery.create({
    data: {
      workspace_id: project.workspace_id,
      project_id: project.id,
      license_id: licenseId,
      idempotency_key: crypto.randomUUID(),
      event_type: eventType,
      payload: { event: eventType, ...payload, delivered_via: "qstash" },
      status: "pending",
      next_publish_at: new Date(),
    },
    select: { id: true },
  });
  return delivery.id;
}

/**
 * Var olan outbox kaydını QStash'e yayınlar. Hata ana iş işlemini geri almaz;
 * next_publish_at alanı reconciliation cron'unun güvenilir retry yapmasını sağlar.
 */
export async function publishWebhookDelivery(
  deliveryId: string
): Promise<boolean> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      idempotency_key: true,
      status: true,
      next_publish_at: true,
    },
  });
  if (
    !delivery ||
    delivery.status === "delivered" ||
    delivery.next_publish_at === null
  ) {
    return false;
  }

  const qstash = getQStash();
  if (!qstash) return false;

  try {
    await withPublishTimeout(
      qstash.publishJSON({
        url: `${appBaseUrl()}/api/qstash/webhook-deliver`,
        body: { delivery_id: delivery.id },
        retries: 3,
        deduplicationId: delivery.idempotency_key,
      })
    );
    const queuedAt = new Date();
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: delivery.status === "processing" ? "processing" : "pending",
        queued_at: queuedAt,
        next_publish_at: new Date(queuedAt.getTime() + REPUBLISH_AFTER_MS),
        publish_attempt_count: { increment: 1 },
        last_error: null,
      },
    });
    return true;
  } catch (error) {
    logError("qstash.publish_failed", error, {
      delivery_id: delivery.id,
    });
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: delivery.status === "processing" ? "processing" : "pending",
        publish_attempt_count: { increment: 1 },
        next_publish_at: new Date(Date.now() + PUBLISH_BACKOFF_MS),
        last_error: "Kuyruğa alınamadı.",
      },
    });
    return false;
  }
}

/**
 * Transaction dışında kullanılan uyumluluk yardımcısı (ör. cron). Önce outbox
 * kaydını commit eder, sonra yayınlamayı dener.
 */
export async function enqueueLicenseWebhook(
  projectId: string,
  licenseId: string | null,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspace_id: true },
  });
  if (!project) return;

  const deliveryId = await prisma.$transaction((tx) =>
    createLicenseWebhookDelivery(
      tx,
      project.workspace_id,
      projectId,
      licenseId,
      eventType,
      payload
    )
  );
  if (deliveryId) await publishWebhookDelivery(deliveryId);
}

/**
 * Publish ile DB commit arasındaki boşluğu ve yarım kalmış consumer claim'lerini
 * tarar. QStash deduplication ID ve consumer claim'i tekrar yayını güvenli kılar.
 */
export async function reconcileWebhookDeliveries(): Promise<{
  found: number;
  published: number;
}> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);

  await prisma.webhookDelivery.updateMany({
    where: {
      status: "processing",
      processing_started_at: { lt: staleBefore },
      delivered_at: null,
    },
    data: {
      status: "pending",
      processing_started_at: null,
      next_publish_at: now,
      last_error: "Yarım kalan teslim yeniden kuyruğa alındı.",
    },
  });

  const candidates = await prisma.webhookDelivery.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      next_publish_at: { lte: now },
      delivered_at: null,
    },
    orderBy: { next_publish_at: "asc" },
    take: RECONCILE_BATCH_SIZE,
    select: { id: true },
  });

  let published = 0;
  for (const candidate of candidates) {
    if (await publishWebhookDelivery(candidate.id)) published += 1;
  }
  return { found: candidates.length, published };
}
