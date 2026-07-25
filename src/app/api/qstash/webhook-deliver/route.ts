import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/crypto/encryption";
import { assertSafeWebhookUrl, SsrfError } from "@/lib/security/ssrf-guard";
import { verifyQStashRequest } from "@/lib/queue/verify";

export const dynamic = "force-dynamic";

/**
 * QStash webhook teslim tüketicisi.
 * QStash imzasını doğrular, teslim kaydını okur, SSRF korumalı ve HMAC imzalı
 * olarak proje webhook adresine POST eder, sonucu kaydeder.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("upstash-signature");
  const authHeader = req.headers.get("authorization");

  const authorized = await verifyQStashRequest(signature, body, authHeader);
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let deliveryId: string;
  try {
    deliveryId = JSON.parse(body).delivery_id;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { project: { select: { license_webhook_url: true, license_webhook_secret: true } } },
  });
  if (!delivery) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (delivery.status === "delivered") {
    return NextResponse.json({ status: "already_delivered" });
  }

  const url = delivery.project.license_webhook_url;
  const encryptedSecret = delivery.project.license_webhook_secret;
  if (!url || !encryptedSecret) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "failed", last_error: "Webhook yapılandırması eksik.", attempt_count: { increment: 1 } },
    });
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 422 });
  }

  // SSRF koruması
  try {
    await assertSafeWebhookUrl(url);
  } catch (error) {
    const message = error instanceof SsrfError ? error.message : "SSRF kontrolü başarısız.";
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "failed", last_error: message, attempt_count: { increment: 1 } },
    });
    return NextResponse.json({ error: "ssrf_blocked" }, { status: 422 });
  }

  const payloadString = JSON.stringify(delivery.payload);
  const secret = decryptSecret(encryptedSecret);
  const hmac = crypto.createHmac("sha256", secret).update(payloadString).digest("hex");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Panel-Event": delivery.event_type,
        "X-Panel-Signature": `sha256=${hmac}`,
        "X-Panel-Delivery": delivery.id,
        "X-Idempotency-Key": delivery.idempotency_key,
      },
      body: payloadString,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const excerpt = (await res.text().catch(() => "")).slice(0, 500);
    const success = res.ok;

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: success ? "delivered" : "failed",
        http_status: res.status,
        attempt_count: { increment: 1 },
        delivered_at: success ? new Date() : null,
        response_excerpt: excerpt,
        last_error: success ? null : `HTTP ${res.status}`,
      },
    });

    if (!success) {
      // QStash'in yeniden denemesi için 500 döndür
      return NextResponse.json({ error: "delivery_failed", http_status: res.status }, { status: 500 });
    }
    return NextResponse.json({ status: "delivered" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "failed", attempt_count: { increment: 1 }, last_error: message.slice(0, 500) },
    });
    return NextResponse.json({ error: "delivery_error" }, { status: 500 });
  }
}
