import crypto from "node:crypto";
import { GithubError } from "@/lib/github/client";

/**
 * GitHub OAuth App akışı (opsiyonel).
 *
 * GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET tanımlıysa Ayarlar sayfasında
 * "GitHub ile Bağlan" butonu görünür; tanımlı değilse yalnızca Personal Access
 * Token ile bağlanılır. OAuth App token'ları süresiz olduğundan yenileme
 * (refresh token) akışına gerek yoktur.
 */

/** Repo meta verisi + organizasyon listesi için yeterli en dar kapsam. */
export const OAUTH_SCOPES = "repo read:org read:user";

export const OAUTH_STATE_COOKIE = "gh_oauth_state";
export const OAUTH_STATE_TTL_SECONDS = 600;

export function isOAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

/** CSRF koruması için tek kullanımlık state değeri. */
export function createState(): string {
  return crypto.randomBytes(24).toString("hex");
}

/** Zamanlama saldırısına kapalı state karşılaştırması. */
export function statesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Callback adresi. APP_URL tanımlıysa o kullanılır (GitHub'da kayıtlı adresle
 * birebir eşleşmelidir), aksi halde isteğin kendi origin'i.
 */
export function callbackUrl(requestOrigin: string): string {
  const base = (process.env.APP_URL || requestOrigin).replace(/\/+$/, "");
  return `${base}/api/github/callback`;
}

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES,
    state,
    allow_signup: "false",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export type OAuthTokenResult = { access_token: string; scope: string | null };

/** Authorization code → access token değişimi. */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<OAuthTokenResult> {
  let response: Response;
  try {
    response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "operasyon-merkezi-panel",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
  } catch {
    throw new GithubError("GitHub yetkilendirme sunucusuna ulaşılamadı.", 0);
  }

  if (!response.ok) {
    throw new GithubError(
      `GitHub token değişimi başarısız (HTTP ${response.status}).`,
      response.status
    );
  }

  const payload = (await response.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (payload.error || !payload.access_token) {
    throw new GithubError(
      payload.error_description || "GitHub yetkilendirmesi tamamlanamadı.",
      400
    );
  }

  return { access_token: payload.access_token, scope: payload.scope ?? null };
}
