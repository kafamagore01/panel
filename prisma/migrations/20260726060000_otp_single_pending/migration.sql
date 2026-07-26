-- Eski yarışlardan kalmış birden fazla bekleyen OTP varsa en yenisini koru.
DELETE FROM "otp_codes" older
USING "otp_codes" newer
WHERE older."user_id" = newer."user_id"
  AND older."purpose" = newer."purpose"
  AND older."consumed_at" IS NULL
  AND newer."consumed_at" IS NULL
  AND (
    older."created_at" < newer."created_at"
    OR (
      older."created_at" = newer."created_at"
      AND older."id"::text < newer."id"::text
    )
  );

CREATE UNIQUE INDEX "otp_codes_one_pending_per_user_purpose_idx"
  ON "otp_codes"("user_id", "purpose")
  WHERE "consumed_at" IS NULL;
