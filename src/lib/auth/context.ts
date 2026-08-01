import { cache } from "react";
import { cookies } from "next/headers";
import type { MembershipRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth";
import { logError } from "@/lib/logger";

/** Kullanıcının geçiş yapabileceği aktif çalışma alanı. */
export type WorkspaceMembership = {
  id: string;
  name: string;
  role: MembershipRole;
};

export type AuthContext = {
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
    force_password_reset: boolean;
    two_factor_enabled: boolean;
  };
  /** Aktif ve üyeliği "active" olan workspace; yoksa null */
  workspaceId: string | null;
  workspaceName: string | null;
  role: MembershipRole | null;
  /** Üst bardaki seçici için: silinmemiş workspace'lerdeki aktif üyelikler */
  workspaces: WorkspaceMembership[];
};

export const PASSWORD_RESET_REQUIRED_MESSAGE =
  "Güvenliğiniz için önce parolanızı değiştirmeniz gerekiyor.";

/**
 * Oturum doğrulanamadı ama sebebi kullanıcı değil: oturum deposuna (veritabanı)
 * ulaşılamıyor. "Oturum yok" ile karıştırılmamalıdır — çıkış yaptırmak yerine
 * geçici hata gösterilir, aksi hâlde kesinti tüm kullanıcıları dışarı atar.
 */
export class SessionUnavailableError extends Error {}

/** Auth.js oturum çerezinin üretim ve geliştirme adları. */
export const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

/**
 * auth() veritabanı hatalarını yutar (JWTSessionError) ve oturumu boş döndürür;
 * dönüş değerine bakarak "çerez geçersiz" ile "veritabanı erişilemiyor" ayırt
 * edilemez. Çerez varken oturum çözülemediyse depo tek bir ucuz sorguyla
 * yoklanır: yalnızca bu hata yolunda çalışır, normal akışa maliyeti yoktur.
 */
async function assertSessionStoreReachable(): Promise<void> {
  const store = await cookies();
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => store.has(name));
  if (!hasSessionCookie) return;

  try {
    await prisma.$queryRaw`select 1`;
  } catch (error) {
    logError("auth.session_store_unreachable", error);
    throw new SessionUnavailableError(
      "Oturum bilgisi doğrulanamıyor: veritabanına ulaşılamıyor."
    );
  }
}

export function isPasswordResetRequired(
  ctx: AuthContext | null | undefined
): boolean {
  return ctx?.user.force_password_reset === true;
}

/**
 * Oturumdaki kullanıcıyı ve aktif workspace bağlamını döndürür.
 * Üyelik pasifse workspace bağlamı null olur (erişim reddedilir).
 * React cache() ile istek başına tek kez çalışır.
 *
 * null = oturum yok/geçersiz. Oturum deposuna ulaşılamıyorsa null yerine
 * SessionUnavailableError fırlatılır; çağıranlar bunu çıkışa değil geçici
 * hataya çevirmelidir.
 *
 * Performans: kullanıcı, aktif üyelik ve geçiş yapılabilir workspace listesi
 * tek sorguda çekilir. Ayrı sorgular sunucusuz ortamda sıralı round trip'e
 * dönüşüp her sayfa render'ına veritabanı gecikmesi kadar süre ekliyordu.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    await assertSessionStoreReachable();
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatar_url: true,
      force_password_reset: true,
      two_factor_enabled_at: true,
      current_workspace_id: true,
      memberships: {
        where: { status: "active", workspace: { deleted_at: null } },
        select: {
          workspace_id: true,
          role: true,
          workspace: { select: { name: true } },
        },
        orderBy: { created_at: "asc" },
      },
    },
  });
  if (!user) return null;

  const workspaces: WorkspaceMembership[] = user.memberships.map((m) => ({
    id: m.workspace_id,
    name: m.workspace.name,
    role: m.role,
  }));

  // Aktif workspace yalnızca listede varsa geçerlidir: üyelik pasifse veya
  // workspace silinmişse where filtresi zaten dışarıda bırakır.
  const active = user.current_workspace_id
    ? (workspaces.find((w) => w.id === user.current_workspace_id) ?? null)
    : null;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
      force_password_reset: user.force_password_reset,
      two_factor_enabled: Boolean(user.two_factor_enabled_at),
    },
    workspaceId: active?.id ?? null,
    workspaceName: active?.name ?? null,
    role: active?.role ?? null,
    workspaces,
  };
});
