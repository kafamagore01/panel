"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronsUpDown,
  CircleAlert,
  ExternalLink,
  GitFork,
  Loader2,
  Lock,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { GithubMark } from "@/components/icons/github-mark";
import { formatRelative } from "@/lib/format";
import { fetchGithubRepos } from "@/actions/github";
import type { RepoOption } from "@/lib/github/repos";

/**
 * GitHub reposu hızlı seçimi.
 *
 * Liste ilk açılışta çekilir ve bileşen ömrü boyunca bellekte tutulur
 * (sunucu tarafında da 2 dakikalık cache vardır). Bağlantı yoksa kullanıcı
 * Ayarlar sayfasına yönlendirilir.
 */

/** "idle" hem açılmamış hem de yükleniyor durumunu kapsar (liste yüklenirken). */
type LoadState =
  | { status: "idle" }
  | { status: "ready"; repos: RepoOption[] }
  | { status: "error"; message: string };

export function RepoPicker({
  value,
  onSelect,
  onClear,
}: {
  /** Seçili repo "owner/repo"; boşsa seçim yapılmamış. */
  value: string;
  onSelect: (repo: RepoOption) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const requested = useRef(false);

  // Liste yalnızca kullanıcı açtığında ve bir kez çekilir; form açılışını
  // yavaşlatmaz. Tazelik sunucu tarafındaki kısa ömürlü cache ile sağlanır.
  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;
    fetchGithubRepos().then((res) => {
      setState(
        res.success
          ? { status: "ready", repos: res.data }
          : { status: "error", message: res.error }
      );
    });
  }, [open]);

  const filtered = useMemo(() => {
    if (state.status !== "ready") return [];
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return state.repos.slice(0, 50);
    return state.repos
      .filter(
        (r) =>
          r.full_name.toLocaleLowerCase("tr").includes(q) ||
          (r.description ?? "").toLocaleLowerCase("tr").includes(q)
      )
      .slice(0, 50);
  }, [state, query]);

  function choose(repo: RepoOption) {
    onSelect(repo);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="min-w-0 flex-1 justify-between font-normal"
            >
              <span className="flex min-w-0 items-center gap-2">
                <GithubMark className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {value || "GitHub'dan repo seçin"}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent align="start" className="w-[min(28rem,90vw)] p-0">
            <div className="border-b p-2">
              <div className="relative">
                <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Repo ara…"
                  className="pl-8"
                  autoFocus
                />
              </div>
            </div>
            <RepoList
              state={state}
              repos={filtered}
              selected={value}
              onChoose={choose}
            />
          </PopoverContent>
        </Popover>

        {value && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onClear}
            title="Repo bağlantısını kaldır"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {value && (
        <Link
          href={`https://github.com/${value}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[#5267ff] hover:underline"
        >
          github.com/{value}
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function RepoList({
  state,
  repos,
  selected,
  onChoose,
}: {
  state: LoadState;
  repos: RepoOption[];
  selected: string;
  onChoose: (repo: RepoOption) => void;
}) {
  if (state.status === "idle") {
    return (
      <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Repolar yükleniyor…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-2 p-4">
        <p className="flex items-start gap-2 text-sm text-amber-800">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {state.message}
        </p>
        <Link
          href="/ayarlar"
          className="inline-block text-sm font-semibold text-[#5267ff] hover:underline"
        >
          Ayarlar → GitHub Bağlantısı
        </Link>
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Eşleşen repo bulunamadı.
      </p>
    );
  }

  return (
    <ul className="max-h-72 overflow-y-auto py-1">
      {repos.map((repo) => (
        <li key={repo.id}>
          <button
            type="button"
            onClick={() => onChoose(repo)}
            className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
          >
            <span className="mt-0.5 w-4 shrink-0">
              {selected === repo.full_name && (
                <Check className="h-4 w-4 text-[#5267ff]" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-[#141821]">
                  {repo.full_name}
                </span>
                {repo.private && (
                  <Lock className="h-3 w-3 shrink-0 text-amber-600" />
                )}
                {repo.fork && (
                  <GitFork className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                {repo.archived && (
                  <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">
                    ARŞİV
                  </span>
                )}
              </span>
              {repo.description && (
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {repo.description}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">
                {repo.language ? `${repo.language} · ` : ""}
                {repo.default_branch} · {formatRelative(repo.pushed_at)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
