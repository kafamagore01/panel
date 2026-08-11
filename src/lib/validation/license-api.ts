import { z } from "zod";
import { ACTIVATION_TOKEN_REGEX } from "@/lib/crypto/license-key";

const instanceId = z.string().trim().min(3).max(200);

export const validateLicenseApiSchema = z.object({
  license_key: z.string().trim().min(1).max(128),
  domain: z.string().trim().min(1).max(253),
  environment: z.enum(["production", "staging", "local"]).default("production"),
  instance_id: instanceId,
  activation_token: z.string().regex(ACTIVATION_TOKEN_REGEX).optional(),
  app_version: z.string().trim().max(50).optional(),
});

export const deactivateLicenseApiSchema = z.object({
  license_key: z.string().trim().min(1).max(128),
  instance_id: instanceId,
  activation_token: z.string().regex(ACTIVATION_TOKEN_REGEX),
});
