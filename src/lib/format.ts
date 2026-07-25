/** Türkçe yerelleştirilmiş biçimlendirme yardımcıları. */

const TZ = "Europe/Istanbul";

export function formatMoney(
  value: number | string | { toString(): string },
  currency = "TRY"
): string {
  const amount = typeof value === "number" ? value : Number(value.toString());
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/** Döviz kuru gösterimi — TCMB bülteni 4 ondalık basamakla yayınlar. */
export function formatRate(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeZone: TZ,
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TZ,
  }).format(date);
}

/** Ölçek sırası: en büyük eşiği aşan birim seçilir. */
const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/**
 * "3 saat önce" biçiminde göreli zaman.
 * Sonuç geçerli ana bağlı olduğundan yalnızca istemci bileşenlerinde
 * kullanılmalıdır (sunucu/istemci hydration farkı oluşmasın).
 */
export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = date.getTime() - Date.now();
  if (!Number.isFinite(diff)) return "—";

  const rtf = new Intl.RelativeTimeFormat("tr-TR", { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(Math.round(diff / 1000), "second");
}

/** Prisma Decimal / string / number → number */
export function toNumber(value: number | string | { toString(): string } | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}
