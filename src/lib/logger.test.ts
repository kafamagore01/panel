import assert from "node:assert/strict";
import test from "node:test";
import { structuredErrorRecord } from "./logger";

test("yapılandırılmış hata kaydı sırları maskeler ve correlation id taşır", () => {
  const record = structuredErrorRecord(
    "db.failure",
    new Error(
      "postgresql://user:password@db.example.com/panel token=super-secret"
    ),
    { request_id: "req-123", workspace_id: "ws-1" }
  );
  assert.equal(record.request_id, "req-123");
  assert.equal(record.event, "db.failure");
  assert.equal(record.workspace_id, "ws-1");
  assert.ok(!String(record.error_message).includes("password"));
  assert.ok(!String(record.error_message).includes("super-secret"));
});
