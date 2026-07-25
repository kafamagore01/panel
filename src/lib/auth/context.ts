import { cache } from "react";
import type { MembershipRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth";

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
};

/**
 * Oturumdaki kullanıcıyı ve aktif workspace bağlamını döndürür.
 * Üyelik pasifse workspace bağlamı null olur (erişim reddedilir).
 * React cache() ile istek başına tek DB sorgusu yapılır.
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
    },
  });
  if (!user) return null;

  let workspaceId: string | null = null;
  let workspaceName: string | null = null;
  let role: MembershipRole | null = null;

  if (user.current_workspace_id) {
    const membership = await prisma.workspaceUser.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: user.current_workspace_id,
          user_id: user.id,
        },
      },
      include: { workspace: { select: { name: true, deleted_at: true } } },
    });
    if (
      membership &&
      membership.status === "active" &&
      !membership.workspace.deleted_at
    ) {
      workspaceId = membership.workspace_id;
      workspaceName = membership.workspace.name;
      role = membership.role;
    }
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
      force_password_reset: user.force_password_reset,
      two_factor_enabled: Boolean(user.two_factor_enabled_at),
    },
    workspaceId,
    workspaceName,
    role,
  };
});
