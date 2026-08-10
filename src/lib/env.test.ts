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

test("kritik üretim sırları eksikse reddeder", () => {
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
  assert.ok(issues.some((issue) => issue.includes("CRON_SECRET")));
  assert.ok(issues.some((issue) => issue.includes("NEXT_SERVER_ACTIONS")));
  assert.ok(issues.some((issue) => issue.includes("HTTPS")));
});

test("Upstash ve QStash tanımsızken üretim ortamını kabul eder", () => {
  const withoutQueues: Record<string, string> = { ...validProductionEnv };
  for (const key of [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "QSTASH_TOKEN",
    "QSTASH_CURRENT_SIGNING_KEY",
    "QSTASH_NEXT_SIGNING_KEY",
  ]) {
    delete withoutQueues[key];
  }
  assert.deepEqual(validateEnvironment(withoutQueues, true), []);
});

test("yarım Upstash ve imzasız QStash yapılandırmasını reddeder", () => {
  const halfRedis = validateEnvironment(
    { ...validProductionEnv, UPSTASH_REDIS_REST_TOKEN: "" },
    true
  );
  assert.ok(halfRedis.some((issue) => issue.includes("birlikte tanımlanmalı")));

  const unsignedQStash = validateEnvironment(
    { ...validProductionEnv, QSTASH_CURRENT_SIGNING_KEY: "" },
    true
  );
  assert.ok(
    unsignedQStash.some((issue) => issue.includes("QSTASH_CURRENT_SIGNING_KEY"))
  );
});

test("e-posta sürücüsü seçilmemişse üretim ortamını kabul eder", () => {
  const withoutEmail: Record<string, string> = { ...validProductionEnv };
  delete withoutEmail.EMAIL_DRIVER;
  delete withoutEmail.EMAIL_FROM;
  delete withoutEmail.RESEND_API_KEY;
  assert.deepEqual(validateEnvironment(withoutEmail, true), []);
});

test("e-posta sürücüsü seçildiyse eksik yapılandırmayı reddeder", () => {
  const issues = validateEnvironment(
    { ...validProductionEnv, RESEND_API_KEY: "" },
    true
  );
  assert.ok(issues.some((issue) => issue.includes("RESEND_API_KEY")));

  const smtpIssues = validateEnvironment(
    { ...validProductionEnv, EMAIL_DRIVER: "smtp", RESEND_API_KEY: "" },
    true
  );
  assert.ok(smtpIssues.some((issue) => issue.includes("SMTP_HOST")));

  const badDriver = validateEnvironment(
    { ...validProductionEnv, EMAIL_DRIVER: "sendgrid" },
    true
  );
  assert.ok(badDriver.some((issue) => issue.includes("EMAIL_DRIVER")));
});

test("DATABASE_URL Supabase session mode portuna bakıyorsa reddeder", () => {
  const sessionMode = validateEnvironment(
    {
      ...validProductionEnv,
      DATABASE_URL:
        "postgresql://user:pw@aws-1-eu-west-1.pooler.supabase.com:5432/postgres",
    },
    true
  );
  assert.ok(sessionMode.some((issue) => issue.includes("session mode")));

  // Doğrudan veritabanı host'u da sunucusuz runtime için uygun değil.
  const directHost = validateEnvironment(
    {
      ...validProductionEnv,
      DATABASE_URL: "postgresql://user:pw@db.abcdefgh.supabase.co:5432/postgres",
    },
    true
  );
  assert.ok(directHost.some((issue) => issue.includes("session mode")));
});

test("DATABASE_URL transaction mode portunu kullanıyorsa kabul eder", () => {
  assert.deepEqual(
    validateEnvironment(
      {
        ...validProductionEnv,
        DATABASE_URL:
          "postgresql://user:pw@aws-1-eu-west-1.pooler.supabase.com:6543/postgres",
      },
      true
    ),
    []
  );
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
