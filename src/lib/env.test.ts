import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationBaseUrl,
  validateEnvironment,
} from "./env";

const validProductionEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:password@db.example.com:5432/panel",
  NEXTAUTH_SECRET: "n".repeat(32),
  APP_PEPPER: "p".repeat(32),
  ENCRYPTION_KEY: "a".repeat(64),
  APP_URL: "https://panel.example.com/",
  UPSTASH_REDIS_REST_URL: "https://redis.example.com",
  UPSTASH_REDIS_REST_TOKEN: "token",
  QSTASH_TOKEN: "token",
  QSTASH_CURRENT_SIGNING_KEY: "current",
  QSTASH_NEXT_SIGNING_KEY: "next",
  CRON_SECRET: "c".repeat(32),
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  EMAIL_DRIVER: "resend",
  EMAIL_FROM: "no-reply@example.com",
  RESEND_API_KEY: "re_test",
} as const;

test("geçerli üretim ortamını kabul eder", () => {
  assert.deepEqual(validateEnvironment(validProductionEnv, true), []);
});

test("kritik üretim sırları ve dağıtık servisler eksikse reddeder", () => {
  const issues = validateEnvironment(
    {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost/panel",
      NEXTAUTH_SECRET: "short",
      APP_PEPPER: "",
      ENCRYPTION_KEY: "bad",
      APP_URL: "http://panel.example.com",
    },
    true
  );
  assert.ok(issues.some((issue) => issue.includes("NEXTAUTH_SECRET")));
  assert.ok(issues.some((issue) => issue.includes("UPSTASH_REDIS_REST_URL")));
  assert.ok(issues.some((issue) => issue.includes("NEXT_SERVER_ACTIONS")));
  assert.ok(issues.some((issue) => issue.includes("HTTPS")));
});

test("taban URL'yi normalize eder ve üretimde HTTP'yi reddeder", () => {
  assert.equal(
    applicationBaseUrl({ APP_URL: "http://localhost:3000/" }),
    "http://localhost:3000"
  );
  assert.throws(
    () =>
      applicationBaseUrl({
        NODE_ENV: "production",
        APP_URL: "http://panel.example.com",
      }),
    /HTTPS/
  );
});
