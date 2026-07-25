"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Health = "checking" | "up" | "down";

/** Üst bardaki canlı sistem durumu göstergesi — /up endpoint'ine 30 sn'de bir ping. */
export function SystemStatus() {
  const [health, setHealth] = useState<Health>("checking");

  useEffect(() => {
    let active = true;
    async function ping() {
      try {
        const res = await fetch("/up", { cache: "no-store" });
        if (active) setHealth(res.ok ? "up" : "down");
      } catch {
        if (active) setHealth("down");
      }
    }
    ping();
    const id = setInterval(ping, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const config = {
    checking: { dot: "bg-slate-400", label: "Kontrol ediliyor" },
    up: { dot: "bg-emerald-500", label: "Sistem Çalışıyor" },
    down: { dot: "bg-rose-500", label: "Bağlantı Sorunu" },
  }[health];

  return (
    <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 sm:flex">
      <span className="relative flex h-2 w-2">
        {health === "up" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", config.dot)} />
      </span>
      <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
    </div>
  );
}
