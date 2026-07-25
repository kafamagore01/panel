"use client";

import Link from "next/link";
import { CircleAlert, CircleDot, GitBranch, Lock } from "lucide-react";
import { GithubMark } from "@/components/icons/github-mark";
import { formatRelative } from "@/lib/format";
import type { SnapshotResult } from "@/lib/github/repos";

/**
 * Projeler tablosundaki GitHub hücresi.
 * `result` gelene kadar (canlı çekim sürerken) repo adı yükleniyor durumunda
 * gösterilir; hata olursa satır bazında sebebi title olarak taşınır.
 */
export function RepoCell({
  fullName,
  result,
}: {
  fullName: string | null;
  result: SnapshotResult | undefined;
}) {
  if (!fullName) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <div className="min-w-0 max-w-56 space-y-0.5">
      <Link
        href={`https://github.com/${fullName}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 text-sm font-medium text-[#141821] hover:text-[#5267ff]"
      >
        <GithubMark className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{fullName}</span>
      </Link>

      {result === undefined && (
        <span className="block h-3 w-24 animate-pulse rounded bg-slate-100" />
      )}

      {result?.ok === false && (
        <span
          title={result.error}
          className="flex items-center gap-1 text-[11px] text-amber-700"
        >
          <CircleAlert className="h-3 w-3 shrink-0" />
          Okunamadı
        </span>
      )}

      {result?.ok && (
        <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <GitBranch className="h-3 w-3" />
            {result.snapshot.default_branch}
          </span>
          {result.snapshot.open_issues_count > 0 && (
            <span className="flex items-center gap-0.5">
              <CircleDot className="h-3 w-3" />
              {result.snapshot.open_issues_count}
            </span>
          )}
          {result.snapshot.private && (
            <Lock className="h-3 w-3 text-amber-600" />
          )}
          <span title={result.snapshot.last_commit?.message ?? undefined}>
            {formatRelative(
              result.snapshot.last_commit?.committed_at ?? result.snapshot.pushed_at
            )}
          </span>
        </span>
      )}
    </div>
  );
}
