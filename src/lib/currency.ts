/** Para birimi tanımları ve TL dönüşüm yardımcıları (client + server ortak). */

/**
 * Seçilebilen para birimleri. TCMB günlük bülteninde yayımlananların kuru
 * otomatik gelir; listenin sonundaki birimler bültende yer almadığı için
 * kurları formda elle girilir.
 */
export const CURRENCY_CODES = [
  "TRY",
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "CAD",
  "AUD",
  "SEK",
  "NOK",
  "DKK",
  "RUB",
  "CNY",
  "SAR",
  "AZN",
  "KWD",
  "QAR",
  "AED",
  "INR",
  "SGD",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/** Panelin ana para birimi; dövizli tutarlar bu birime çevrilerek gösterilir. */
export const BASE_CURRENCY = "TRY";

const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  TRY: "Türk Lirası",
  USD: "ABD Doları",
  EUR: "Euro",
  GBP: "İngiliz Sterlini",
  CHF: "İsviçre Frangı",
  JPY: "Japon Yeni",
  CAD: "Kanada Doları",
  AUD: "Avustralya Doları",
  SEK: "İsveç Kronu",
  NOK: "Norveç Kronu",
  DKK: "Danimarka Kronu",
  RUB: "Rus Rublesi",
  CNY: "Çin Yuanı",
  SAR: "Suudi Riyali",
  AZN: "Azerbaycan Manatı",
  KWD: "Kuveyt Dinarı",
  QAR: "Katar Riyali",
  AED: "BAE Dirhemi",
  INR: "Hindistan Rupisi",
  SGD: "Singapur Doları",
};

/** Tüm para birimi seçicilerinin ortak veri kaynağı. */
export const CURRENCY_OPTIONS = CURRENCY_CODES.map((code) => ({
  code,
  name: CURRENCY_NAMES[code],
  label: `${code} · ${CURRENCY_NAMES[code]}`,
}));

/** TCMB bülteninden türetilen kur anlık görüntüsü. */
export type ExchangeRates = {
  /** Bülten tarihi — "25.07.2026" */
  date: string;
  /** Para birimi kodu → 1 birimin TL karşılığı (TCMB döviz satış kuru) */
  rates: Record<string, number>;
};

export function isForeignCurrency(code: string): boolean {
  return code !== BASE_CURRENCY;
}

/** Para biriminin TL kuru; bültende yoksa null. */
export function getRate(
  code: string,
  snapshot: ExchangeRates | null | undefined
): number | null {
  if (!isForeignCurrency(code)) return 1;
  const rate = snapshot?.rates[code];
  return typeof rate === "number" && rate > 0 ? rate : null;
}

/** Kurun kaynağı — kayda elle girilmiş kur mu, günlük TCMB bülteni mi. */
export type RateSource = "base" | "manual" | "tcmb";

export type ResolvedRate = { value: number; source: RateSource };

/**
 * Kullanılacak kuru belirler: kayda özel elle girilmiş kur varsa o, yoksa
 * TCMB'nin günlük kuru. Elle girilen kur sabit kalır; TCMB kuru her gün
 * kendiliğinden tazelendiği için TL karşılığı da güncel kalır.
 */
export function resolveRate(
  code: string,
  manualRate: number | null | undefined,
  snapshot: ExchangeRates | null | undefined
): ResolvedRate | null {
  if (!isForeignCurrency(code)) return { value: 1, source: "base" };
  if (typeof manualRate === "number" && Number.isFinite(manualRate) && manualRate > 0) {
    return { value: manualRate, source: "manual" };
  }
  const rate = getRate(code, snapshot);
  return rate === null ? null : { value: rate, source: "tcmb" };
}

/**
 * Tutarın verilen kurla TL karşılığı; kur bilinmiyorsa null.
 * Kur otomatik (TCMB) ya da kullanıcının elle girdiği değer olabilir.
 */
export function convertWithRate(amount: number, rate: number | null): number | null {
  if (rate === null || !Number.isFinite(amount)) return null;
  return Math.round(amount * rate * 100) / 100;
}
