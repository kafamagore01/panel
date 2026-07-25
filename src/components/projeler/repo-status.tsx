"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CircleAlert,
  CircleDot,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  Lock,
  Star,
} from "lucide-react";
import { formatRelative } from "@/lib/format";
import { fetchRepoSnapshot } from "@/actions/github";
import type { RepoSnapshot } from "@/lib/github/repos";

/**
 * Bağlı reponun canlı durumu. Veri veritabanında tutulmaz; bileşen
 * göründüğünde GitHub'dan okunur (sunucuda 60 sn'lik bellek cache'i vardır).
 *
 * Repo değiştiğinde çağıran taraf `key={fullName}` vererek bileşeni yeniden
 * kurar; böylece durum sıfırlaması için efekt içinde setState gerekmez.
 */
export function RepoStatusPanel({ fullName }: { fullName: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; snapshot: RepoSnapshot | null }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetchRepoSnapshot(fullName).then((res) => {
      if (!active) return;
      setState(
        res.success
          ? { status: "ready", snapshot: res.data }
          : { status: "error", message: res.error }
      );
    });
    return () => {
      active = false;
    };
  }, [fullName]);

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Repo bilgisi GitHub&apos;dan okunuyor…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        {state.message}
      </p>
    );
  }

  const snapshot = state.snapshot;
  if (!snapshot) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-muted-foreground">
        Repo bilgisi alınamadı. Ayarlar sayfasından GitHub bağlantısını kontrol edin.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <GitBranch className="h-3.5 w-3.5" />
          {snapshot.default_branch}
        </span>
        <span className="flex items-center gap-1">
          <CircleDot className="h-3.5 w-3.5" />
          {snapshot.open_issues_count} açık issue
        </span>
        <span className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5" />
          {snapshot.stargazers_count}
        </span>
        {snapshot.private && (
          <span className="flex items-center gap-1 text-amber-700">
            <Lock className="h-3.5 w-3.5" />
            Özel
          </span>
        )}
        {snapshot.language && <span>{snapshot.language}</span>}
        {snapshot.archived && (
          <span className="font-semibold text-slate-500">ARŞİVLENMİŞ</span>
        )}
      </div>

      {snapshot.last_commit ? (
        <div className="flex items-start gap-2 text-xs">
          <GitCommitHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5267ff]" />
          <span className="min-w-0">
            <Link
              href={snapshot.last_commit.html_url}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-1 font-medium text-[#141821] hover:text-[#5267ff]"
            >
              {snapshot.last_commit.message}
            </Link>
            <span className="text-muted-foreground">
              {snapshot.last_commit.author ?? "bilinmiyor"} ·{" "}
              {formatRelative(snapshot.last_commit.committed_at)} ·{" "}
              <span className="font-mono">
                {snapshot.last_commit.sha.slice(0, 7)}
              </span>
            </span>
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Henüz commit yok.</p>
      )}
    </div>
  );
}
