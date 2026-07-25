"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/audit";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";
import { GithubError } from "@/lib/github/client";
import {
  GithubNotConnectedError,
  getConnectionSummary,
  refreshConnection,
  removeConnection,
  saveConnection,
  type GithubConnectionSummary,
} from "@/lib/github/connection";
import {
  getRepoSnapshot,
  getRepoSnapshots,
  listRepoOptions,
  type RepoOption,
  type RepoSnapshot,
  type SnapshotResult,
} from "@/lib/github/repos";

/**
 * GitHub entegrasyonu server action'ları.
 *
 * Yetki ayrımı:
 *  - Bağlantı kurma/kaldırma → `system.manage` (yalnızca Owner); token tüm
 *    çalışma alanı adına repo erişimi verdiği için en dar yetkiye bağlanır.
 *  - Repo listeleme → `record.manage` (proje oluşturan roller).
 *  - Repo durumu okuma → `module.view` (tüm aktif üyeler).
 */

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  if (error instanceof GithubNotConnectedError) return fail(error.message);
  if (error instanceof GithubError) return fail(error.message);
  console.error(error);
  return fail("GitHub işlemi sırasında beklenmeyen bir hata oluştu.");
}

// ─── Bağlantı yönetimi ───────────────────────────────────────────────────────

const tokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20, "Token en az 20 karakter olmalıdır.")
    .max(255, "Token çok uzun.")
    .regex(
      /^(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)$/,
      "Geçerli bir GitHub token'ı girin (ghp_… veya github_pat_…)."
    ),
});

/** Personal Access Token ile bağlanır; token doğrulanmadan kaydedilmez. */
export async function connectGithubWithToken(
  input: unknown
): Promise<ActionResponse<{ account_login: string }>> {
  try {
    const ctx = await requirePermission("system.manage");
    const parsed = tokenSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);

    const viewer = await saveConnection({
      workspaceId: ctx.workspaceId,
      userId: ctx.user.id,
      token: parsed.data.token,
      authType: "pat",
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "GITHUB_CONNECT",
      auditable_type: "github_connection",
      auditable_id: ctx.workspaceId,
      after_data: { auth_type: "pat", account_login: viewer.login },
    });

    revalidatePath("/ayarlar");
    revalidatePath("/projeler");
    return ok(
      { account_login: viewer.login },
      `GitHub bağlandı: @${viewer.login}`
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function disconnectGithub(): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("system.manage");
    const { removed, account_login } = await removeConnection(ctx.workspaceId);
    if (!removed) return fail("Kaldırılacak bir GitHub bağlantısı yok.");

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "GITHUB_DISCONNECT",
      auditable_type: "github_connection",
      auditable_id: ctx.workspaceId,
      before_data: { account_login },
    });

    revalidatePath("/ayarlar");
    revalidatePath("/projeler");
    return ok(
      null,
      "GitHub bağlantısı kaldırıldı. Projelerdeki repo eşleşmeleri korundu."
    );
  } catch (error) {
    return handleError(error);
  }
}

/** Token'ı yeniden doğrular ve hesap bilgilerini tazeler. */
export async function verifyGithubConnection(): Promise<
  ActionResponse<{ account_login: string }>
> {
  try {
    const ctx = await requirePermission("system.manage");
    const viewer = await refreshConnection(ctx.workspaceId);
    revalidatePath("/ayarlar");
    return ok(
      { account_login: viewer.login },
      `Bağlantı doğrulandı: @${viewer.login}`
    );
  } catch (error) {
    return handleError(error);
  }
}

/** Ayarlar kartı için bağlantı özeti (token içermez). */
export async function fetchGithubConnection(): Promise<
  ActionResponse<GithubConnectionSummary | null>
> {
  try {
    const ctx = await requirePermission("module.view");
    return ok(await getConnectionSummary(ctx.workspaceId));
  } catch (error) {
    return handleError(error);
  }
}

// ─── Repo okuma ──────────────────────────────────────────────────────────────

/** Proje formundaki hızlı seçim listesi. */
export async function fetchGithubRepos(): Promise<ActionResponse<RepoOption[]>> {
  try {
    const ctx = await requirePermission("record.manage");
    const repos = await listRepoOptions(ctx.workspaceId);
    if (repos.length === 0) {
      const summary = await getConnectionSummary(ctx.workspaceId);
      if (!summary) throw new GithubNotConnectedError();
    }
    return ok(repos);
  } catch (error) {
    return handleError(error);
  }
}

/** Tek repo için canlı durum (form önizlemesi). */
export async function fetchRepoSnapshot(
  fullName: string
): Promise<ActionResponse<RepoSnapshot | null>> {
  try {
    const ctx = await requirePermission("module.view");
    if (typeof fullName !== "string" || !fullName.includes("/")) {
      return fail("Geçersiz repo adı.");
    }
    return ok(await getRepoSnapshot(ctx.workspaceId, fullName));
  } catch (error) {
    return handleError(error);
  }
}

/** Projeler listesi için toplu canlı durum; tek round-trip'te döner. */
export async function fetchRepoSnapshots(
  fullNames: string[]
): Promise<ActionResponse<Record<string, SnapshotResult>>> {
  try {
    const ctx = await requirePermission("module.view");
    if (!Array.isArray(fullNames)) return fail("Geçersiz istek.");
    // Sayfa başına satır sayısıyla sınırlı tutulur; istemciden gelen liste
    // şişirilerek oran limiti tüketilmesin.
    const safe = fullNames
      .filter((n): n is string => typeof n === "string" && n.includes("/"))
      .slice(0, 50);
    return ok(await getRepoSnapshots(ctx.workspaceId, safe));
  } catch (error) {
    return handleError(error);
  }
}
