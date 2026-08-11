import { cache } from "react";
import type { MembershipRole } from "@/generated/prisma/client";
import {
  getAuthContext,
  isPasswordResetRequired,
  PASSWORD_RESET_REQUIRED_MESSAGE,
  type AuthContext,
} from "@/lib/auth/context";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_ROLE_PERMISSIONS,
  IMMUTABLE_ROLES,
  normalizePermissions,
  type PermissionAction,
} from "@/lib/auth/permission-catalog";

export type { PermissionAction } from "@/lib/auth/permission-catalog";

export class PermissionError extends Error {
  readonly status = 403;
}

export function hasPermission(
  role: MembershipRole | null,
  action: PermissionAction,
  grantedPermissions?: readonly PermissionAction[]
): boolean {
  if (!role) return false;
  if (IMMUTABLE_ROLES.includes(role)) return true;
  if (action === "roles.manage") return false;

  const permissions = grantedPermissions ?? DEFAULT_ROLE_PERMISSIONS[role];
  return permissions.includes(action);
}

/** Bir çalışma alanındaki rolün varsayılan veya özelleştirilmiş etkin izinleri. */
export const getEffectivePermissions = cache(
  async (
    workspaceId: string,
    role: MembershipRole
  ): Promise<readonly PermissionAction[]> => {
    if (IMMUTABLE_ROLES.includes(role)) {
      return DEFAULT_ROLE_PERMISSIONS[role];
    }

    const override = await prisma.workspaceRolePermission.findUnique({
      where: { workspace_id_role: { workspace_id: workspaceId, role } },
      select: { permissions: true },
    });

    return override
      ? normalizePermissions(override.permissions)
      : DEFAULT_ROLE_PERMISSIONS[role];
  }
);

export async function hasWorkspacePermission(
  workspaceId: string | null,
  role: MembershipRole | null,
  action: PermissionAction
): Promise<boolean> {
  if (!workspaceId || !role) return false;
  const permissions = await getEffectivePermissions(workspaceId, role);
  return hasPermission(role, action, permissions);
}

/** Rolün atayabileceği roller: Sahip her rolü, Yönetici yalnız alt rolleri verir. */
export function assignableRolesFor(role: MembershipRole): MembershipRole[] {
  if (role === "owner") {
    return ["owner", "admin", "technical", "finance", "viewer"];
  }
  if (role === "admin") {
    return ["technical", "finance", "viewer"];
  }
  return ["technical", "finance", "viewer"];
}

export type AuthorizedContext = AuthContext & {
  workspaceId: string;
  role: MembershipRole;
};

/** Her Server Action girişinde güncel çalışma alanı rol izinlerini doğrular. */
export async function requirePermission(
  action: PermissionAction
): Promise<AuthorizedContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    throw new PermissionError("Bu işlem için oturum açmanız gerekiyor.");
  }
  if (isPasswordResetRequired(ctx)) {
    throw new PermissionError(PASSWORD_RESET_REQUIRED_MESSAGE);
  }
  if (!ctx.workspaceId || !ctx.role) {
    throw new PermissionError(
      "Aktif çalışma alanı bulunamadı veya üyeliğiniz pasif durumda."
    );
  }
  if (!(await hasWorkspacePermission(ctx.workspaceId, ctx.role, action))) {
    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "SECURITY_DENIED",
      auditable_type: "permission",
      auditable_id: action,
      after_data: { attempted_action: action, role: ctx.role },
    });
    throw new PermissionError("Bu işlem için yetkiniz bulunmuyor.");
  }
  return ctx as AuthorizedContext;
}
