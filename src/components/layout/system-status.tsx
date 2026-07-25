"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { CheckItem, UptimeReport } from "@/lib/uptime-types";
import { cn } from "@/lib/utils";

/** Kontrol turu aralığı. */
const POLL_MS = 60_000;

type Phase =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; report: UptimeReport };

const TONES = {
  neutral: { dot: "bg-slate-400", text: "text-muted-foreground" },
  up: { dot: "bg-emerald-500", text: "text-muted-foreground" },
  partial: { dot: "bg-amber-500", text: "text-amber-700" },
  down: { dot: "bg-rose-500", text: "text-rose-700" },
} as const;

type Tone = keyof typeof TONES;

function summary(phase: Phase): { tone: Tone; label: string; pulse: boolean } {
  if (phase.kind === "loading") {
    return { tone: "neutral", label: "Kontrol ediliyor", pulse: false };
  }
  if (phase.kind === "error") {
    return { tone: "neutral", label: "Durum alınamadı", pulse: false };
  }
  const { state, total, down_count } = phase.report;
  switch (state) {
    case "empty":
      return { tone: "neutral", label: "İzlenen kayıt yok", pulse: false };
    case "up":
      return { tone: "up", label: `${total}/${total} çalışıyor`, pulse: true };
    case "partial":
      return { tone: "partial", label: `${down_count} sorun var`, pulse: false };
    case "down":
      return { tone: "down", label: "Tümü kapalı", pulse: false };
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ITEM_DOT: Record<CheckItem["state"], string> = {
  up: "bg-emerald-500",
  down: "bg-rose-500",
  unknown: "bg-slate-300",
};

function CheckGroup({ title, items }: { title: string; items: CheckItem[] }) {
  if (items.length === 0) return null;
  const monitored = items.filter((i) => i.state !== "unknown");
  const up = monitored.filter((i) => i.state === "up").length;

  return (
    <div className="border-b border-slate-200/70 last:border-b-0">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          {title}
        </span>
        {monitored.length > 0 && (
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
            {up}/{monitored.length}
          </span>
        )}
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2.5 px-4 py-2">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                ITEM_DOT[item.state]
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">
                {item.name}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {item.target}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 text-[11px] font-medium tabular-nums",
                item.state === "down" ? "text-rose-600" : "text-muted-foreground"
              )}
            >
              {item.state === "up" ? `${item.response_ms} ms` : item.error}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Üst bardaki sistem durumu göstergesi. Projelerin canlı adreslerini (HTTP) ve
 * aktif sunucuları (SSH portuna TCP) 60 saniyede bir kontrol eder; üzerine
 * gelindiğinde kayıt kayıt döküm gösterir.
 */
export function SystemStatus() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const activeRef = useRef(true);

  const load = useCallback(async (force = false) => {
    try {
      const res = await fetch(`/api/sistem-durumu${force ? "?yenile=1" : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const report: UptimeReport = await res.json();
      if (activeRef.current) setPhase({ kind: "ready", report });
    } catch {
      if (activeRef.current) setPhase({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    // load() durumu yalnızca fetch tamamlandıktan sonra günceller; render
    // sırasında senkron bir setState oluşmaz.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();

    const id = setInterval(() => {
      // Sekme arka plandayken boş yere istek atma
      if (document.visibilityState === "visible") load();
    }, POLL_MS);

    return () => {
      activeRef.current = false;
      clearInterval(id);
    };
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  const { tone, label, pulse } = summary(phase);
  const style = TONES[tone];
  const report = phase.kind === "ready" ? phase.report : null;
  const hasRows = Boolean(
    report && (report.sites.length > 0 || report.servers.length > 0)
  );

  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={refresh}
          className="hidden items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-3 py-1.5 outline-none transition-colors hover:border-[#5267ff]/40 sm:flex"
        >
          <span className="relative flex h-2 w-2">
            {pulse && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={cn("relative inline-flex h-2 w-2 rounded-full", style.dot)}
            />
          </span>
          <span className={cn("text-xs font-medium", style.text)}>{label}</span>
        </button>
      </HoverCardTrigger>

      <HoverCardContent align="end" className="w-80 rounded-[14px] p-0">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-foreground">Sistem Durumu</p>
            <p className="text-xs text-muted-foreground">
              {report
                ? `Son kontrol ${formatTime(report.checked_at)}`
                : "Kontrol ediliyor…"}
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Şimdi kontrol et"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
        </div>

        {phase.kind === "error" && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Durum bilgisi alınamadı.
          </p>
        )}

        {report && !hasRows && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            İzlenecek kayıt yok. Projelere &quot;Canlı Adres&quot; girdikçe ve
            aktif sunucu ekledikçe burada listelenir.
          </p>
        )}

        {report && hasRows && (
          <>
            <div className="max-h-80 overflow-y-auto">
              <CheckGroup title="Siteler" items={report.sites} />
              <CheckGroup title="Sunucular" items={report.servers} />
            </div>
            <p className="border-t border-slate-200/80 px-4 py-2 text-[11px] text-muted-foreground">
              {report.up_count}/{report.total} çalışıyor · 60 saniyede bir
              kontrol edilir
            </p>
          </>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
