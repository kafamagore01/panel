import assert from "node:assert/strict";
import test from "node:test";
import {
  deactivateLicenseApiSchema,
  validateLicenseApiSchema,
} from "./license-api";

const key = "PT-ABCDE-FGHIJ-KLMNO-PQRST";

test("doğrulama için domain ve instance_id zorunludur", () => {
  assert.equal(validateLicenseApiSchema.safeParse({ license_key: key }).success, false);
  const parsed = validateLicenseApiSchema.safeParse({
    license_key: key,
    domain: "example.com",
    instance_id: "server-001",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.environment, "production");
});

test("deaktivasyon aktivasyon tokenı olmadan kabul edilmez", () => {
  assert.equal(
    deactivateLicenseApiSchema.safeParse({
      license_key: key,
      instance_id: "server-001",
    }).success,
    false
  );
  assert.equal(
    deactivateLicenseApiSchema.safeParse({
      license_key: key,
      instance_id: "server-001",
      activation_token: `PAT-${"a".repeat(43)}`,
    }).success,
    true
  );
});
