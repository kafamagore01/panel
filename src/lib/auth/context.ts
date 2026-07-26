import { cache } from "react";
import type { MembershipRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth";

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

/**
 * Oturumdaki kullanıcıyı ve aktif workspace bağlamını döndürür.
 * Üyelik pasifse workspace bağlamı null olur (erişim reddedilir).
 * React cache() ile istek başına tek kez çalışır.
 *
 * Performans: kullanıcı, aktif üyelik ve geçiş yapılabilir workspace listesi
 * tek sorguda çekilir. Ayrı sorgular sunucusuz ortamda sıralı round trip'e
 * dönüşüp her sayfa render'ına veritabanı gecikmesi kadar süre ekliyordu.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

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
