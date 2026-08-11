import assert from "node:assert/strict";
import test from "node:test";
import {
  addLicenseGraceDays,
  addLicenseYear,
  isLicenseDate,
  licenseExpiresAt,
  licenseStartsAt,
} from "./dates";

test("başlangıç ve bitişi Türkiye gün sınırlarında oluşturur", () => {
  assert.equal(
    licenseStartsAt("2026-08-11").toISOString(),
    "2026-08-10T21:00:00.000Z"
  );
  assert.equal(
    licenseExpiresAt("2026-08-11")?.toISOString(),
    "2026-08-11T20:59:59.999Z"
  );
});

test("takvimde bulunmayan tarihleri reddeder", () => {
  assert.equal(isLicenseDate("2026-02-29"), false);
  assert.equal(isLicenseDate("2028-02-29"), true);
});

test("ek süreyi bitiş anından itibaren tam gün olarak ekler", () => {
  const expiresAt = licenseExpiresAt("2026-08-11");
  assert.equal(
    addLicenseGraceDays(expiresAt, 14)?.toISOString(),
    "2026-08-25T20:59:59.999Z"
  );
});

test("yenilemeyi sabit 365 gün yerine takvim yılı olarak hesaplar", () => {
  assert.equal(
    addLicenseYear(new Date("2028-02-29T20:59:59.999Z")).toISOString(),
    "2029-02-28T20:59:59.999Z"
  );
});
