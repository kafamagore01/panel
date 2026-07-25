/**
 * Domain normalizasyonu (lisans doğrulama API'si ve domain kayıtları için).
 * - http:// veya https:// (ve diğer şemalar) temizlenir
 * - userinfo, port, path, query, fragment atılır
 * - lowercase yapılır, sondaki nokta(lar) kırpılır
 * Geçersiz girişte null döner.
 */
const DOMAIN_LABEL_RE =
  /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/;

export function normalizeDomain(input: string): string | null {
  if (typeof input !== "string") return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;

  // şema (http://, https://, ftp:// vb.)
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  // path / query / fragment
  value = value.split("/")[0].split("?")[0].split("#")[0];
  // userinfo (user:pass@host)
  const at = value.lastIndexOf("@");
  if (at !== -1) value = value.slice(at + 1);
  // port
  value = value.replace(/:\d+$/, "");
  // sondaki nokta(lar)
  value = value.replace(/\.+$/, "");

  if (!value || value.length > 253) return null;
  if (!DOMAIN_LABEL_RE.test(value)) return null;
  return value;
}

/** Domain/SSL süre takibi eşikleri (gün). */
export const EXPIRY_CRITICAL_DAYS = 7;
export const EXPIRY_WARNING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Verilen tarihe kalan tam gün sayısı; geçmiş tarihlerde negatif, tarih yoksa null.
 * Hidrasyon farkı oluşmaması için yalnızca sunucuda hesaplanıp satıra yazılır.
 */
export function daysUntil(
  value: Date | string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!value) return null;
  const target = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / DAY_MS);
}

export type ExpiryTone = "expired" | "critical" | "warning" | "ok" | "none";

/** Kalan güne göre uyarı seviyesi — liste rozetleri ve KPI'lar aynı eşiği kullanır. */
export function expiryTone(days: number | null): ExpiryTone {
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= EXPIRY_CRITICAL_DAYS) return "critical";
  if (days <= EXPIRY_WARNING_DAYS) return "warning";
  return "ok";
}
