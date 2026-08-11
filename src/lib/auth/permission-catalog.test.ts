import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  normalizePermissions,
} from "./permission-catalog";

test("Sahip ve Yönetici tüm izinleri sabit olarak alır", () => {
  assert.deepEqual(DEFAULT_ROLE_PERMISSIONS.owner, ALL_PERMISSIONS);
  assert.deepEqual(DEFAULT_ROLE_PERMISSIONS.admin, ALL_PERMISSIONS);
});

test("yazma izni ilgili görüntüleme iznini otomatik ekler", () => {
  assert.deepEqual(normalizePermissions(["customers.update"]), [
    "customers.view",
    "customers.update",
  ]);
});

test("bilinmeyen, yöneticiye özel ve tekrar eden izinler temizlenir", () => {
  assert.deepEqual(
    normalizePermissions([
      "roles.manage",
      "unknown.delete",
      "team.delete",
      "team.delete",
      null,
    ]),
    ["team.view", "team.delete"]
  );
});
