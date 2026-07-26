-- AlterTable: mutlak oturum üst sınırı
-- Varsayılan, migration ile yeni kodun dağıtımı arasındaki pencerede eski kodun
-- (kolonu bilmeyen sürüm) oturum açabilmesi için bırakılmıştır.
ALTER TABLE "sessions"
ADD COLUMN "absolute_expires_at" TIMESTAMP(3)
DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');

-- Mevcut oturumlar: giriş anından itibaren 7 günlük mutlak sınıra tabi tutulur.
UPDATE "sessions"
SET "absolute_expires_at" = "created_at" + INTERVAL '7 days'
WHERE "absolute_expires_at" IS NULL;

-- Mevcut oturumların 30 günlük "expires" değeri artık hareketsizlik penceresi
-- anlamına geliyor; ilk isteğe kadar geçerli kalmaması için şimdiye çekilir.
UPDATE "sessions"
SET "expires" = LEAST("expires", CURRENT_TIMESTAMP + INTERVAL '2 hours');

ALTER TABLE "sessions"
ALTER COLUMN "absolute_expires_at" SET NOT NULL;

-- CreateIndex
CREATE INDEX "sessions_expires_idx" ON "sessions"("expires");
