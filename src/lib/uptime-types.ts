/**
 * Durum izleme tipleri. Yalnızca tip içerdiği için istemci bileşenleri de
 * güvenle içe aktarabilir (uptime.ts sunucuya özgü modüller kullanır).
 */

/** unknown: izlenecek adres girilmemiş — sorunlu sayılmaz. */
export type CheckState = "up" | "down" | "unknown";

export type CheckItem = {
  id: string;
  name: string;
  /** Site için host adı, sunucu için "host:port" */
  target: string;
  state: CheckState;
  response_ms: number | null;
  /** Sorun varsa kısa açıklama: "HTTP 502", "Zaman aşımı", "Adres girilmemiş" */
  error: string | null;
};

/** empty: izlenecek hiçbir kayıt yok | up: hepsi ayakta | partial: bir kısmı sorunlu | down: hepsi sorunlu */
export type OverallState = "empty" | "up" | "partial" | "down";

export type UptimeReport = {
  checked_at: string;
  sites: CheckItem[];
  servers: CheckItem[];
  /** İzlenebilir (adresi girilmiş) kayıt sayısı */
  total: number;
  up_count: number;
  down_count: number;
  state: OverallState;
};
