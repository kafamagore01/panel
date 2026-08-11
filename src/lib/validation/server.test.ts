import assert from "node:assert/strict";
import test from "node:test";
import { serverSchema } from "./server";

test("boş SSH parolasını kayıt isteğinden çıkarır", () => {
  const parsed = serverSchema.parse({ name: "Demo", ssh_password: "" });
  assert.equal(parsed.ssh_password, undefined);
});

test("SSH parolasındaki boşlukları değiştirmeden korur", () => {
  const password = "  güçlü parola  ";
  const parsed = serverSchema.parse({ name: "Demo", ssh_password: password });
  assert.equal(parsed.ssh_password, password);
});

test("aşırı uzun SSH parolasını reddeder", () => {
  const parsed = serverSchema.safeParse({
    name: "Demo",
    ssh_password: "x".repeat(1001),
  });
  assert.equal(parsed.success, false);
});
