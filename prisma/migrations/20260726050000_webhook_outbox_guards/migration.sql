ALTER TYPE "WebhookDeliveryStatus" ADD VALUE IF NOT EXISTS 'processing';

ALTER TABLE "webhook_deliveries"
  ADD COLUMN "publish_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "queued_at" TIMESTAMP(3),
  ADD COLUMN "next_publish_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "processing_started_at" TIMESTAMP(3);

CREATE INDEX "webhook_deliveries_status_next_publish_at_idx"
  ON "webhook_deliveries"("status", "next_publish_at");
