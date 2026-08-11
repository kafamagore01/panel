ALTER TABLE "license_activations"
ADD COLUMN "activation_token_hash" TEXT;

CREATE UNIQUE INDEX "license_activations_activation_token_hash_key"
ON "license_activations"("activation_token_hash");
