import type { GithubAuthType } from "@/generated/prisma/client";
import { tenantClientFor } from "@/lib/db/tenant";
import { decryptSecret, encryptSecret } from "@/lib/crypto/encryption";
import { invalidateWorkspace } from "@/lib/github/cache";
import { fetchViewer, type GithubViewer } from "@/lib/github/client";

/**
 * Çalışma alanı düzeyindeki GitHub bağlantısının okunması/yazılması.
 *
 * Token asla istemciye gönderilmez: veritabanında AES-256-GCM ile şifreli
 * durur, yalnızca sunucu tarafında `decryptSecret` ile çözülür.
 */

export class GithubNotConnectedError extends Error {
  constructor(
    message = "GitHub bağlantısı kurulmamış. Ayarlar sayfasından bağlayın."
  ) {
    super(message);
    this.name = "GithubNotConnectedError";
  }
}

/** İstemciye güvenle gönderilebilen bağlantı özeti (token içermez). */
export type GithubConnectionSummary = {
  auth_type: GithubAuthType;
  account_login: string;
  account_name: string | null;
  account_type: string | null;
  account_avatar_url: string | null;
  scopes: string[];
  last_verified_at: string | null;
  connected_at: string;
  connected_by_name: string | null;
};

export async function getConnectionSummary(
  workspaceId: string
): Promise<GithubConnectionSummary | null> {
  const db = tenantClientFor(workspaceId);
  const row = await db.githubConnection.findFirst({
    include: { author: { select: { name: true } } },
  });
  if (!row) return null;

  return {
    auth_type: row.auth_type,
    account_login: row.account_login,
    account_name: row.account_name,
    account_type: row.account_type,
    account_avatar_url: row.account_avatar_url,
    scopes: parseScopes(row.scopes),
    last_verified_at: row.last_verified_at?.toISOString() ?? null,
    connected_at: row.created_at.toISOString(),
    connected_by_name: row.author?.name ?? null,
  };
}

/** Çözülmüş erişim token'ı; bağlantı yoksa null. */
export async function getWorkspaceToken(
  workspaceId: string
): Promise<string | null> {
  const db = tenantClientFor(workspaceId);
  const row = await db.githubConnection.findFirst({
    select: { access_token: true },
  });
  if (!row) return null;

  try {
    return decryptSecret(row.access_token);
  } catch (error) {
    console.error("GitHub token'ı çözülemedi:", error);
    return null;
  }
}

/** Token yoksa GithubNotConnectedError fırlatır. */
export async function requireWorkspaceToken(
  workspaceId: string
): Promise<string> {
  const token = await getWorkspaceToken(workspaceId);
  if (!token) throw new GithubNotConnectedError();
  return token;
}

/**
 * Token'ı GitHub'a doğrulatıp bağlantıyı oluşturur veya günceller.
 * Çalışma alanı başına tek kayıt tutulur (workspace_id benzersiz).
 */
export async function saveConnection(params: {
  workspaceId: string;
  userId: string;
  token: string;
  authType: GithubAuthType;
  scopes?: string | null;
}): Promise<GithubViewer> {
  const viewer = await fetchViewer(params.token);
  const db = tenantClientFor(params.workspaceId);

  const data = {
    auth_type: params.authType,
    access_token: encryptSecret(params.token),
    scopes: params.scopes ?? null,
    account_login: viewer.login,
    account_name: viewer.name,
    account_type: viewer.type,
    account_avatar_url: viewer.avatar_url,
    connected_by: params.userId,
    last_verified_at: new Date(),
  };

  const existing = await db.githubConnection.findFirst({ select: { id: true } });
  if (existing) {
    await db.githubConnection.update({ where: { id: existing.id }, data });
  } else {
    // workspace_id tenant katmanınca zaten zorlanır; tip için açıkça verilir.
    await db.githubConnection.create({
      data: { ...data, workspace_id: params.workspaceId },
    });
  }

  invalidateWorkspace(params.workspaceId);
  return viewer;
}

/** Bağlantıyı kaldırır; kaldırılacak kayıt yoksa false döner. */
export async function removeConnection(
  workspaceId: string
): Promise<{ removed: boolean; account_login: string | null }> {
  const db = tenantClientFor(workspaceId);
  const existing = await db.githubConnection.findFirst({
    select: { id: true, account_login: true },
  });
  if (!existing) return { removed: false, account_login: null };

  await db.githubConnection.delete({ where: { id: existing.id } });
  invalidateWorkspace(workspaceId);
  return { removed: true, account_login: existing.account_login };
}

/** Token'ı yeniden doğrular ve hesap bilgilerini tazeler. */
export async function refreshConnection(
  workspaceId: string
): Promise<GithubViewer> {
  const token = await requireWorkspaceToken(workspaceId);
  const viewer = await fetchViewer(token);

  const db = tenantClientFor(workspaceId);
  const existing = await db.githubConnection.findFirst({ select: { id: true } });
  if (existing) {
    await db.githubConnection.update({
      where: { id: existing.id },
      data: {
        account_login: viewer.login,
        account_name: viewer.name,
        account_type: viewer.type,
        account_avatar_url: viewer.avatar_url,
        last_verified_at: new Date(),
      },
    });
  }

  invalidateWorkspace(workspaceId);
  return viewer;
}

function parseScopes(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
