import assert from "node:assert/strict";
import test from "node:test";
import { parseOptionValue } from "./query-params";

const options = [
  { value: "active", label: "Aktif" },
  { value: "archived", label: "Arşiv" },
] as const;

test("yalnız allowlist içindeki query enum değerini kabul eder", () => {
  assert.equal(parseOptionValue("active", options), "active");
  assert.equal(parseOptionValue("invalid", options), undefined);
  assert.equal(parseOptionValue(undefined, options), undefined);
});
