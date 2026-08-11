import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateLicenseState,
  LICENSE_CHECK_INTERVAL_SECONDS,
  licenseLease,
} from "./policy";

const now = new Date("2026-08-11T12:00:00.000Z");

test("süresi devam eden aktif lisansı kabul eder", () => {
  assert.deepEqual(
    evaluateLicenseState(
      {
        status: "active",
        startsAt: null,
        expiresAt: new Date("2026-08-12T00:00:00.000Z"),
        graceEndsAt: null,
      },
      now
    ),
    { valid: true, status: "active", inGrace: false }
  );
});

test("bitişten sonra ek süreyi, ek süreden sonra reddi uygular", () => {
  const inGrace = evaluateLicenseState(
    {
      status: "active",
      startsAt: null,
      expiresAt: new Date("2026-08-10T00:00:00.000Z"),
      graceEndsAt: new Date("2026-08-12T00:00:00.000Z"),
    },
    now
  );
  assert.deepEqual(inGrace, { valid: true, status: "grace", inGrace: true });

  const expired = evaluateLicenseState(
    {
      status: "active",
      startsAt: null,
      expiresAt: new Date("2026-08-09T00:00:00.000Z"),
      graceEndsAt: new Date("2026-08-10T00:00:00.000Z"),
    },
    now
  );
  assert.deepEqual(expired, { valid: false, code: "expired" });
});

test("istemciye 10 dakikalık kontrol ve 24 saatlik çevrimdışı pencere verir", () => {
  const lease = licenseLease(now);
  assert.equal(LICENSE_CHECK_INTERVAL_SECONDS, 600);
  assert.equal(lease.next_check_at, "2026-08-11T12:10:00.000Z");
  assert.equal(lease.offline_grace_until, "2026-08-12T12:00:00.000Z");
});
