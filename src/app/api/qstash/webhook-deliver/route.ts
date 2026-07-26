import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/crypto/encryption";
import {
  safeHttpRequest,
  SsrfError,
} from "@/lib/security/ssrf-guard";
import { verifyQStashRequest } from "@/lib/queue/verify";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  delivery_id: z.uuid(),
});
const CLAIM_LEASE_MS = 2 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 8;
const RETRY_PUBLISH_DELAY_MS = 60 * 1000;

/**
 * QStash webhook teslim tüketicisi. Atomik status claim'i aynı outbox kaydının
 * paralel consumer'lar tarafından iki kez dış yan etki üretmesini engeller.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  if (body.length > 4_096) {
    return NextResponse.json({ error: "body_too_large" }, { status: 413 });
  }

  const authorized = await verifyQStashRequest(
    req.headers.get("upstash-signature"),
    body,
    req.headers.get("authorization")
  );
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(decoded);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const deliveryId = parsed.data.delivery_id;
  const claimTime = new Date();
  const staleBefore = new Date(claimTime.getTime() - CLAIM_LEASE_MS);
  const claimed = await prisma.webhookDelivery.updateMany({
    where: {
      id: deliveryId,
      delivered_at: null,
      attempt_count: { lt: MAX_DELIVERY_ATTEMPTS },
      OR: [
        { status: { in: ["pending", "failed"] } },
        {
          status: "processing",
          processing_started_at: { lt: staleBefore },
        },
      ],
    },
    data: {
      status: "processing",
      processing_started_at: claimTime,
      attempt_count: { increment: 1 },
    },
  });

  if (claimed.count === 0) {
    const current = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      select: { status: true, attempt_count: true },
    });
    if (!current) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (current.status === "delivered") {
      return NextResponse.json({ status: "already_delivered" });
    }
    return NextResponse.json({
      status:
        current.attempt_count >= MAX_DELIVERY_ATTEMPTS
          ? "attempt_limit_reached"
          : "already_processing",
    });
  }

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      project: {
        select: {
          license_webhook_url: true,
          license_webhook_secret: true,
        },
      },
    },
  });
  if (!delivery) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = delivery.project.license_webhook_url;
  const encryptedSecret = delivery.project.license_webhook_secret;
  if (!url || !encryptedSecret) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        processing_started_at: null,
        next_publish_at: null,
        last_error: "Webhook yapılandırması eksik.",
      },
    });
    return NextResponse.json(
      { error: "webhook_not_configured" },
      { status: 422 }
    );
  }

  try {
    const payloadString = JSON.stringify(delivery.payload);
    const secret = decryptSecret(encryptedSecret);
    const hmac = crypto
      .createHmac("sha256", secret)
      .update(payloadString)
      .digest("hex");

    const res = await safeHttpRequest(url, {
      method: "POST",
      allowedProtocols: ["https:"],
      redirect: "error",
      maxRedirects: 0,
      timeoutMs: 10_000,
      maxResponseBytes: 500,
      bodyLimitMode: "truncate",
      subject: "Webhook URL'i",
      headers: {
        "Content-Type": "application/json",
        "X-Panel-Event": delivery.event_type,
        "X-Panel-Signature": `sha256=${hmac}`,
        "X-Panel-Delivery": delivery.id,
        "X-Idempotency-Key": delivery.idempotency_key,
      },
      body: payloadString,
    });

    const success = res.status >= 200 && res.status < 300;
    const retryable = delivery.attempt_count < MAX_DELIVERY_ATTEMPTS;
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: success ? "delivered" : "failed",
        http_status: res.status,
        processing_started_at: null,
        delivered_at: success ? new Date() : null,
        response_excerpt: null,
        next_publish_at:
          success || !retryable
            ? null
            : new Date(Date.now() + RETRY_PUBLISH_DELAY_MS),
        last_error: success ? null : `HTTP ${res.status}`,
      },
    });

    if (!success) {
      return NextResponse.json(
        { error: "delivery_failed", http_status: res.status },
        { status: retryable ? 500 : 422 }
      );
    }
    return NextResponse.json({ status: "delivered" });
  } catch (error) {
    const ssrfBlocked = error instanceof SsrfError;
    const retryable =
      !ssrfBlocked && delivery.attempt_count < MAX_DELIVERY_ATTEMPTS;
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        processing_started_at: null,
        next_publish_at: retryable
          ? new Date(Date.now() + RETRY_PUBLISH_DELAY_MS)
          : null,
        last_error: ssrfBlocked
          ? "Webhook hedefi güvenlik politikası tarafından engellendi."
          : "Webhook tesliminde ağ veya yapılandırma hatası oluştu.",
      },
    });
    if (!ssrfBlocked) {
      console.error("Webhook teslim hatası:", error);
    }
    return NextResponse.json(
      { error: ssrfBlocked ? "ssrf_blocked" : "delivery_error" },
      { status: retryable ? 500 : 422 }
    );
  }
}
