import { cn } from "@/lib/utils";

/**
 * Şartname §3 durum rengi haritası — tek merkezî eşleme.
 * yeşil: aktif/canlı/ödendi/teslim | sarı: bekleyen/geliştirme/kısmi
 * kırmızı: askıda/süresi dolmuş/gecikmiş/başarısız | gri: arşiv/taslak/iptal
 */

type Tone = "green" | "amber" | "red" | "slate";

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-rose-50 text-rose-700 border-rose-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_TONE: Record<string, Tone> = {
  // yeşil
  active: "green",
  live: "green",
  paid: "green",
  delivered: "green",
  completed: "green",
  // sarı / turuncu
  pending: "amber",
  development: "amber",
  partial: "amber",
  testing: "amber",
  grace: "amber",
  maintenance: "amber",
  on_hold: "amber",
  lead: "amber",
  staging: "amber",
  paused: "amber",
  // kırmızı
  suspended: "red",
  expired: "red",
  overdue: "red",
  failed: "red",
  revoked: "red",
  terminated: "red",
  inactive: "red",
  // gri
  archived: "slate",
  draft: "slate",
  void: "slate",
  deactivated: "slate",
  transferred: "slate",
  cancelled: "slate",
  issued: "slate",
  refunded: "slate",
  local: "slate",
  production: "green",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Aktif",
  live: "Canlı",
  paid: "Ödendi",
  delivered: "Teslim Edildi",
  completed: "Tamamlandı",
  pending: "Beklemede",
  development: "Geliştirme",
  partial: "Kısmi",
  testing: "Test",
  grace: "Ek Süre",
  maintenance: "Bakım",
  on_hold: "Askıda",
  lead: "Aday",
  staging: "Hazırlık",
  paused: "Duraklatıldı",
  suspended: "Askıya Alındı",
  expired: "Süresi Doldu",
  overdue: "Gecikmiş",
  failed: "Başarısız",
  revoked: "İptal Edildi",
  terminated: "Sonlandırıldı",
  inactive: "Pasif",
  archived: "Arşivlendi",
  draft: "Taslak",
  void: "İptal",
  deactivated: "Devre Dışı",
  transferred: "Devredildi",
  cancelled: "Bırakıldı",
  issued: "Düzenlendi",
  refunded: "İade Edildi",
  local: "Yerel",
  production: "Canlı Ortam",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const tone = STATUS_TONE[status] ?? "slate";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONE_CLASS[tone],
        className
      )}
    >
      {label ?? statusLabel(status)}
    </span>
  );
}
