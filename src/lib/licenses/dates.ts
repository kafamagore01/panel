const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLicenseDate(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function parseDateOnly(value: string, time: string): Date {
  if (!isLicenseDate(value)) {
    throw new Error("Geçersiz lisans tarihi.");
  }
  // Türkiye yıl boyunca UTC+03:00 kullanır. HTML date alanlarının UTC gece
  // yarısına dönüşüp bitiş gününü erkenden kapatmasını önler.
  const parsed = new Date(`${value}T${time}+03:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Geçersiz lisans tarihi.");
  }
  return parsed;
}

export function licenseStartsAt(value?: string): Date {
  return value ? parseDateOnly(value, "00:00:00.000") : new Date();
}

export function licenseExpiresAt(value?: string): Date | null {
  return value ? parseDateOnly(value, "23:59:59.999") : null;
}

export function addLicenseGraceDays(expiresAt: Date | null, days: number): Date | null {
  if (!expiresAt || days <= 0) return null;
  return new Date(expiresAt.getTime() + days * 24 * 60 * 60 * 1000);
}

/** 365 gün değil takvim yılı ekler; 29 Şubat'ı sonraki yılın 28 Şubat'ına sıkıştırır. */
export function addLicenseYear(value: Date): Date {
  const result = new Date(value);
  const targetYear = value.getUTCFullYear() + 1;
  const month = value.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
  result.setUTCFullYear(targetYear, month, Math.min(value.getUTCDate(), lastDay));
  return result;
}
