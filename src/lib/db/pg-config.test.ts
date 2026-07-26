import assert from "node:assert/strict";
import test from "node:test";
import { buildPgConfig } from "./pg-config";

test("boş veya PostgreSQL olmayan bağlantı dizesini reddeder", () => {
  assert.throws(() => buildPgConfig(""), /tanımlı/);
  assert.throws(() => buildPgConfig("https://example.com"), /PostgreSQL/);
});

test("uzak PostgreSQL hedefinde sertifika doğrulamasını zorunlu tutar", () => {
  const config = buildPgConfig(
    "postgresql://user:pass@db.example.com:5432/panel?sslmode=require",
    { NODE_ENV: "production" }
  );
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.ok(!config.connectionString.includes("sslmode"));
});

test("üretimde sslmode=disable değerini reddeder", () => {
  assert.throws(
    () =>
      buildPgConfig(
        "postgresql://user:pass@db.example.com/panel?sslmode=disable",
        { NODE_ENV: "production" }
      ),
    /devre dışı/
  );
});

test("yerel geliştirme bağlantısında açıkça istenmedikçe TLS eklemez", () => {
  const config = buildPgConfig("postgresql://localhost:5432/panel", {
    NODE_ENV: "development",
  });
  assert.equal(config.ssl, undefined);
});
