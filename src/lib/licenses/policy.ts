export const LICENSE_CHECK_INTERVAL_SECONDS = 10 * 60;
export const LICENSE_OFFLINE_GRACE_SECONDS = 24 * 60 * 60;

type LicenseStateInput = {
  status: string;
  startsAt: Date | null;
  expiresAt: Date | null;
  graceEndsAt: Date | null;
};

export type LicenseState =
  | { valid: true; status: "active" | "grace"; inGrace: boolean }
  | { valid: false; code: string };

/** Panel durumunu ve tarih pencerelerini tek bir doğrulama politikasında birleştirir. */
export function evaluateLicenseState(
  license: LicenseStateInput,
  now: Date = new Date()
): LicenseState {
  if (license.status !== "active" && license.status !== "grace") {
    const code =
      license.status === "suspended"
        ? "suspended"
        : license.status === "revoked"
          ? "revoked"
          : license.status === "pending"
            ? "pending"
            : "expired";
    return { valid: false, code };
  }

  if (license.startsAt && license.startsAt > now) {
    return { valid: false, code: "not_started" };
  }

  if (license.expiresAt && license.expiresAt < now) {
    if (license.graceEndsAt && license.graceEndsAt >= now) {
      return { valid: true, status: "grace", inGrace: true };
    }
    return { valid: false, code: "expired" };
  }

  return {
    valid: true,
    status: license.status === "grace" ? "grace" : "active",
    inGrace: license.status === "grace",
  };
}

export function licenseLease(now: Date = new Date()) {
  return {
    check_interval_seconds: LICENSE_CHECK_INTERVAL_SECONDS,
    next_check_at: new Date(
      now.getTime() + LICENSE_CHECK_INTERVAL_SECONDS * 1000
    ).toISOString(),
    offline_grace_seconds: LICENSE_OFFLINE_GRACE_SECONDS,
    offline_grace_until: new Date(
      now.getTime() + LICENSE_OFFLINE_GRACE_SECONDS * 1000
    ).toISOString(),
  };
}
