/**
 * GitHub REST API istemcisi (api.github.com, 2022-11-28 sürümü).
 *
 * Yanıtlar Next.js data cache'ine yazılmaz (`cache: "no-store"`): token
 * çalışma alanına özeldir ve paylaşımlı cache üzerinden başka bir kiracıya
 * sızmamalıdır. Tazelik/oran limiti dengesi süreç içi bellek cache'i ile
 * kurulur — bkz. `lib/github/cache`.
 */

import { lastPageFromLinkHeader } from "@/lib/github/version";

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 8_000;
/** /user/repos sayfalama sınırı: 3 × 100 = en fazla 300 repo. */
const MAX_REPO_PAGES = 3;

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status = 0
  ) {
    super(message);
    this.name = "GithubError";
  }
}

export type GithubViewer = {
  login: string;
  name: string | null;
  type: string | null;
  avatar_url: string | null;
};

export type GithubRepo = {
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
  open_issues_count: number;
  stargazers_count: number;
  forks_count: number;
  /** ISO 8601 */
  pushed_at: string | null;
};

export type GithubCommit = {
  sha: string;
  message: string;
  author: string | null;
  /** ISO 8601 */
  committed_at: string | null;
  html_url: string;
};

// ─── Ham API tipleri (yalnızca kullandığımız alanlar) ────────────────────────

type RawRepo = {
  id: number;
  full_name: string;
  name: string;
  owner?: { login?: string } | null;
  html_url: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  fork: boolean;
  default_branch: string;
  language: string | null;
  open_issues_count: number;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string | null;
};

type RawCommit = {
  sha: string;
  html_url: string;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string } | null;
  } | null;
  author?: { login?: string } | null;
};

// ─── Çekirdek istek ──────────────────────────────────────────────────────────

async function githubResponse(
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "operasyon-merkezi-panel",
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new GithubError("GitHub API zaman aşımına uğradı.", 504);
    }
    throw new GithubError("GitHub API'ye ulaşılamadı.", 0);
  }

  if (!response.ok) throw toGithubError(response);
  return response;
}

async function githubRequest<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await githubResponse(token, path, init);
  return (await response.json()) as T;
}

function toGithubError(response: Response): GithubError {
  const { status } = response;
  if (status === 401) {
    return new GithubError(
      "GitHub token'ı geçersiz veya süresi dolmuş. Bağlantıyı yenileyin.",
      401
    );
  }
  if (status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const minutes = Number.isFinite(reset)
      ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000))
      : null;
    return new GithubError(
      `GitHub API oran limiti aşıldı.${minutes ? ` ${minutes} dakika sonra tekrar deneyin.` : ""}`,
      403
    );
  }
  if (status === 403) {
    return new GithubError(
      "GitHub bu kaynağa erişim izni vermiyor. Token kapsamlarını kontrol edin.",
      403
    );
  }
  if (status === 404) {
    return new GithubError(
      "GitHub kaynağı bulunamadı (silinmiş, yeniden adlandırılmış veya token'ın erişimi yok).",
      404
    );
  }
  return new GithubError(`GitHub API hatası (HTTP ${status}).`, status);
}

// ─── Uç noktalar ─────────────────────────────────────────────────────────────

/** Token sahibini döndürür; token doğrulaması için de kullanılır. */
export async function fetchViewer(token: string): Promise<GithubViewer> {
  const user = await githubRequest<{
    login: string;
    name: string | null;
    type: string | null;
    avatar_url: string | null;
  }>(token, "/user");
  return {
    login: user.login,
    name: user.name,
    type: user.type,
    avatar_url: user.avatar_url,
  };
}

/**
 * Token'ın eriştiği tüm repolar (sahip + katkıcı + organizasyon üyeliği),
 * son push tarihine göre sıralı.
 */
export async function fetchRepos(token: string): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];

  for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
    const batch = await githubRequest<RawRepo[]>(
      token,
      `/user/repos?per_page=100&page=${page}&sort=pushed&direction=desc` +
        "&affiliation=owner,collaborator,organization_member"
    );
    repos.push(...batch.map(normalizeRepo));
    if (batch.length < 100) break;
  }

  return repos;
}

export async function fetchRepo(
  token: string,
  fullName: string
): Promise<GithubRepo> {
  const raw = await githubRequest<RawRepo>(
    token,
    `/repos/${encodeRepoPath(fullName)}`
  );
  return normalizeRepo(raw);
}

/** Repo id'si üzerinden çözüm — repo yeniden adlandırıldığında kullanılır. */
export async function fetchRepoById(
  token: string,
  repoId: string
): Promise<GithubRepo> {
  const raw = await githubRequest<RawRepo>(
    token,
    `/repositories/${encodeURIComponent(repoId)}`
  );
  return normalizeRepo(raw);
}

/** Verilen dalın (veya varsayılan dalın) son commit'i; commit yoksa null. */
export async function fetchLatestCommit(
  token: string,
  fullName: string,
  branch?: string | null
): Promise<GithubCommit | null> {
  const query = branch ? `?per_page=1&sha=${encodeURIComponent(branch)}` : "?per_page=1";
  let commits: RawCommit[];
  try {
    commits = await githubRequest<RawCommit[]>(
      token,
      `/repos/${encodeRepoPath(fullName)}/commits${query}`
    );
  } catch (error) {
    // Boş repo (henüz commit yok) 409 döner — hata değil, veri yokluğudur.
    if (error instanceof GithubError && (error.status === 409 || error.status === 404)) {
      return null;
    }
    throw error;
  }

  const head = commits[0];
  if (!head) return null;

  return {
    sha: head.sha,
    message: (head.commit?.message ?? "").split("\n")[0].slice(0, 200),
    author: head.author?.login ?? head.commit?.author?.name ?? null,
    committed_at: head.commit?.author?.date ?? null,
    html_url: head.html_url,
  };
}

/**
 * Varsayılan dalda erişilebilen toplam commit sayısı. `per_page=1` kullanıldığı
 * için GitHub'ın Link başlığındaki son sayfa numarası doğrudan toplamı verir.
 */
export async function fetchCommitCount(
  token: string,
  fullName: string,
  branch: string
): Promise<number> {
  const query = `?per_page=1&sha=${encodeURIComponent(branch)}`;

  try {
    const response = await githubResponse(
      token,
      `/repos/${encodeRepoPath(fullName)}/commits${query}`
    );
    const commits = (await response.json()) as RawCommit[];
    if (commits.length === 0) return 0;
    return lastPageFromLinkHeader(response.headers.get("link")) ?? 1;
  } catch (error) {
    if (error instanceof GithubError && error.status === 409) return 0;
    throw error;
  }
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function normalizeRepo(raw: RawRepo): GithubRepo {
  return {
    id: String(raw.id),
    full_name: raw.full_name,
    name: raw.name,
    owner: raw.owner?.login ?? raw.full_name.split("/")[0] ?? "",
    html_url: raw.html_url,
    description: raw.description,
    private: raw.private,
    archived: raw.archived,
    fork: raw.fork,
    default_branch: raw.default_branch,
    language: raw.language,
    open_issues_count: raw.open_issues_count,
    stargazers_count: raw.stargazers_count,
    forks_count: raw.forks_count,
    pushed_at: raw.pushed_at,
  };
}

/** "owner/repo" → yol parçaları ayrı ayrı encode edilir. */
function encodeRepoPath(fullName: string): string {
  return fullName.split("/").map(encodeURIComponent).join("/");
}

/** "owner/repo" biçimini doğrular. */
export function isValidRepoFullName(value: string): boolean {
  return /^[\w.-]+\/[\w.-]+$/.test(value);
}

/** GitHub URL'inden "owner/repo" çıkarır; eşleşmezse null. */
export function repoFullNameFromUrl(url: string): string | null {
  const match = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(
    url.trim()
  );
  return match ? `${match[1]}/${match[2]}` : null;
}
