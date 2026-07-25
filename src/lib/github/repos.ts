import { cached } from "@/lib/github/cache";
import {
  fetchLatestCommit,
  fetchRepo,
  fetchRepos,
  GithubError,
  type GithubCommit,
  type GithubRepo,
} from "@/lib/github/client";
import { getWorkspaceToken } from "@/lib/github/connection";

/**
 * Repo verisinin canlı okunması.
 *
 * Veriler veritabanına yazılmaz; her sayfa açılışında GitHub'dan çekilir.
 * Aynı çalışma alanı için kısa ömürlü bellek cache'i (aşağıdaki TTL'ler)
 * oran limitini korur — kullanıcı açısından veri pratikte canlıdır.
 */

const REPO_LIST_TTL_MS = 120_000;
const SNAPSHOT_TTL_MS = 60_000;
/** Tek seferde paralel çekilecek repo sayısı (liste sayfası için yeterli). */
const SNAPSHOT_CONCURRENCY = 6;

/** Seçim listesi için sadeleştirilmiş repo kaydı. */
export type RepoOption = {
  id: string;
  full_name: string;
  name: string;
  owner: string;
  html_url: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  fork: boolean;
  default_branch: string;
  language: string | null;
  pushed_at: string | null;
};

/** Takip paneli için canlı repo durumu. */
export type RepoSnapshot = {
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  default_branch: string;
  language: string | null;
  open_issues_count: number;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string | null;
  last_commit: GithubCommit | null;
};

/** `full_name` → snapshot ya da okunamama sebebi. */
export type SnapshotResult =
  | { ok: true; snapshot: RepoSnapshot }
  | { ok: false; error: string };

export async function listRepoOptions(
  workspaceId: string
): Promise<RepoOption[]> {
  const token = await getWorkspaceToken(workspaceId);
  if (!token) return [];

  return cached(`${workspaceId}:repos`, REPO_LIST_TTL_MS, async () => {
    const repos = await fetchRepos(token);
    return repos.map(toOption);
  });
}

export async function getRepoSnapshot(
  workspaceId: string,
  fullName: string
): Promise<RepoSnapshot | null> {
  const token = await getWorkspaceToken(workspaceId);
  if (!token) return null;

  return cached(`${workspaceId}:snapshot:${fullName}`, SNAPSHOT_TTL_MS, async () => {
    const repo = await fetchRepo(token, fullName);
    // Commit okunamazsa (boş repo / izin) repo bilgisi yine de gösterilir.
    const last_commit = await fetchLatestCommit(
      token,
      repo.full_name,
      repo.default_branch
    ).catch(() => null);
    return toSnapshot(repo, last_commit);
  });
}

/**
 * Birden çok repoyu sınırlı eşzamanlılıkla çeker. Tek bir repo hata verse de
 * diğerleri döner; hata satır bazında gösterilir.
 */
export async function getRepoSnapshots(
  workspaceId: string,
  fullNames: string[]
): Promise<Record<string, SnapshotResult>> {
  const unique = [...new Set(fullNames.filter(Boolean))];
  const results: Record<string, SnapshotResult> = {};
  if (unique.length === 0) return results;

  // Bağlantı yoksa her satır sebebini gösterir — istemci beklemede kalmasın.
  const token = await getWorkspaceToken(workspaceId);
  if (!token) {
    for (const fullName of unique) {
      results[fullName] = {
        ok: false,
        error: "GitHub bağlantısı kurulmamış (Ayarlar → GitHub Bağlantısı).",
      };
    }
    return results;
  }

  const queue = [...unique];
  const workers = Array.from(
    { length: Math.min(SNAPSHOT_CONCURRENCY, queue.length) },
    async () => {
      for (let fullName = queue.shift(); fullName; fullName = queue.shift()) {
        try {
          const snapshot = await getRepoSnapshot(workspaceId, fullName);
          results[fullName] = snapshot
            ? { ok: true, snapshot }
            : { ok: false, error: "GitHub bağlantısı bulunamadı." };
        } catch (error) {
          results[fullName] = {
            ok: false,
            error:
              error instanceof GithubError
                ? error.message
                : "Repo bilgisi alınamadı.",
          };
        }
      }
    }
  );

  await Promise.all(workers);
  return results;
}

function toOption(repo: GithubRepo): RepoOption {
  return {
    id: repo.id,
    full_name: repo.full_name,
    name: repo.name,
    owner: repo.owner,
    html_url: repo.html_url,
    description: repo.description,
    private: repo.private,
    archived: repo.archived,
    fork: repo.fork,
    default_branch: repo.default_branch,
    language: repo.language,
    pushed_at: repo.pushed_at,
  };
}

function toSnapshot(
  repo: GithubRepo,
  last_commit: GithubCommit | null
): RepoSnapshot {
  return {
    full_name: repo.full_name,
    html_url: repo.html_url,
    description: repo.description,
    private: repo.private,
    archived: repo.archived,
    default_branch: repo.default_branch,
    language: repo.language,
    open_issues_count: repo.open_issues_count,
    stargazers_count: repo.stargazers_count,
    forks_count: repo.forks_count,
    pushed_at: repo.pushed_at,
    last_commit,
  };
}
