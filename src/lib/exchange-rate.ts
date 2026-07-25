/**
 * TCMB günlük döviz kuru okuyucu.
 *
 * TCMB `today.xml` her iş günü ~15:30'da güncellenir; hafta sonu ve resmî
 * tatillerde son yayımlanan bülteni döndürür. Bülten bir saatlik data cache ve
 * süreç içi bellekte tutulur; TCMB erişilemezse son bilinen bülten, o da yoksa
 * `null` dönülür (UI kur satırını gizler).
 */

import { BASE_CURRENCY, type ExchangeRates } from "@/lib/currency";

export type { ExchangeRates };

const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
const REQUEST_TIMEOUT_MS = 6_000;
/** Bülten günde bir yayımlanır; süreç içinde 30 dakikalık tazelik yeterli. */
const MEMORY_TTL_MS = 30 * 60 * 1000;
/** TCMB'ye ulaşılamadığında her istekte yeniden denememek için bekleme. */
const RETRY_COOLDOWN_MS = 5 * 60 * 1000;

let cache: ExchangeRates | null = null;
let cachedAt = 0;
let cachedDay = "";
let lastFailureAt = 0;

/** İstanbul saatine göre takvim günü — gün dönünce bülten yeniden çekilir. */
function currentDay(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

function parseAmount(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : 0;
}

function pick(block: string, tag: string): string | undefined {
  return new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block)?.[1];
}

/** TCMB XML'ini kod → TL kuru sözlüğüne çevirir. */
export function parseTcmbXml(xml: string): ExchangeRates | null {
  const date = /Tarih="([\d.]+)"/.exec(xml)?.[1];
  if (!date) return null;

  const rates: Record<string, number> = { [BASE_CURRENCY]: 1 };
  const blocks = xml.matchAll(
    /<Currency\b[^>]*\bCurrencyCode="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g
  );

  for (const [, code, block] of blocks) {
    // Bazı para birimlerinde efektif/döviz alanları boş gelebilir.
    const value =
      parseAmount(pick(block, "ForexSelling")) ||
      parseAmount(pick(block, "BanknoteSelling")) ||
      parseAmount(pick(block, "ForexBuying"));
    // JPY gibi kurlar 100 birim üzerinden yayımlanır.
    const unit = parseAmount(pick(block, "Unit")) || 1;
    if (value > 0) rates[code] = value / unit;
  }

  return Object.keys(rates).length > 1 ? { date, rates } : null;
}

export async function getExchangeRates(): Promise<ExchangeRates | null> {
  const now = Date.now();
  const today = currentDay();
  if (cache && cachedDay === today && now - cachedAt < MEMORY_TTL_MS) return cache;
  if (lastFailureAt && now - lastFailureAt < RETRY_COOLDOWN_MS) return cache;

  for (const url of candidateUrls()) {
    const bulletin = await fetchBulletin(url);
    if (bulletin) {
      cache = bulletin;
      cachedAt = now;
      cachedDay = today;
      lastFailureAt = 0;
      return bulletin;
    }
  }

  lastFailureAt = now;
  // Bayat da olsa son bilinen bülten, hiç kur göstermemekten iyidir.
  return cache;
}

/** today.xml yayında değilse (tatil/kesinti) son iş günlerinin arşivine düşülür. */
function candidateUrls(): string[] {
  const urls = [TCMB_URL];
  const day = new Date();
  for (let i = 0; i < 7; i += 1) {
    day.setDate(day.getDate() - 1);
    urls.push(archiveUrl(day));
  }
  return urls;
}

/** Arşiv bülteni yolu: /kurlar/YYYYMM/DDMMYYYY.xml */
function archiveUrl(day: Date): string {
  const yyyy = day.getFullYear();
  const mm = String(day.getMonth() + 1).padStart(2, "0");
  const dd = String(day.getDate()).padStart(2, "0");
  return `https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`;
}

async function fetchBulletin(url: string): Promise<ExchangeRates | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600, tags: ["tcmb-rates"] },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return parseTcmbXml(await res.text());
  } catch (error) {
    console.error("TCMB kuru alınamadı:", url, error);
    return null;
  }
}
