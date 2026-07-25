import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getQStash, appBaseUrl } from "./qstash";

/**
 * Lisans olayı için webhook teslim kaydı oluşturur ve QStash'e kuyruklar.
 * Asıl HTTP gönderimi (SSRF korumalı) /api/qstash/webhook-deliver içinde yapılır.
 *
 * Not: Bu fonksiyon tenant-scoped değildir (workspace_id parametrelerden türetilir),
 * yalnızca doğrulanmış Server Action'lardan çağrılmalıdır.
 */
export async function enqueueLicenseWebhook(
  projectId: string,
  licenseId: string | null,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspace_id: true, license_webhook_url: true },
  });
  // Webhook yapılandırılmamışsa sessizce çık
  if (!project?.license_webhook_url) return;

  const idempotencyKey = crypto.randomUUID();
  const delivery = await prisma.webhookDelivery.create({
    data: {
      workspace_id: project.workspace_id,
      project_id: project.id,
      license_id: licenseId,
      idempotency_key: idempotencyKey,
      event_type: eventType,
      payload: { event: eventType, ...payload, delivered_via: "qstash" },
      status: "pending",
    },
  });

  const qstash = getQStash();
  if (!qstash) {
    // Kuyruk yapılandırılmamış: kayıt "pending" kalır, cron/manuel tetikleme bekler.
    return;
  }

  try {
    await qstash.publishJSON({
      url: `${appBaseUrl()}/api/qstash/webhook-deliver`,
      body: { delivery_id: delivery.id },
      retries: 3,
      headers: { "Upstash-Deduplication-Id": idempotencyKey },
    });
  } catch (error) {
    console.error("QStash publish hatası:", error);
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "failed", last_error: "Kuyruğa alınamadı." },
    });
  }
}
