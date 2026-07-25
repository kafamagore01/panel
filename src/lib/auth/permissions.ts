import type { MembershipRole } from "@/generated/prisma/client";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { writeAudit } from "@/lib/audit";

/**
 * Rol tabanlı yetkilendirme (RBAC) matrisi.
 *
 * | İşlem                    | owner | admin | technical | finance | viewer |
 * |--------------------------|-------|-------|-----------|---------|--------|
 * | record.manage            |  ✅   |  ✅   |    ✅     |   ❌    |   ❌   |
 * | record.archive           |  ✅   |  ✅   |    ❌     |   ❌    |   ❌   |
 * | license.rotate           |  ✅   |  ✅   |    ❌     |   ❌    |   ❌   |
 * | finance.manage           |  ✅   |  ✅   |    ❌     |   ✅    |   ❌   |
 * | team.manage              |  ✅   |  ✅*  |    ❌     |   ❌    |   ❌   |
 * | system.manage            |  ✅   |  ❌   |    ❌     |   ❌    |   ❌   |
 * | module.view              |  ✅   |  ✅   |    ✅     |   ✅    |   ✅   |
 *
 * *Admin yalnızca technical/finance/viewer rolü atayabilir (assignableRolesFor).
 */

export type PermissionAction =
  | "record.manage"
  | "record.archive"
  | "license.rotate"
  | "finance.manage"
  | "team.manage"
  | "system.manage"
  | "module.view";

const MATRIX: Record<PermissionAction, readonly MembershipRole[]> = {
  "record.manage": ["owner", "admin", "technical"],
  "record.archive": ["owner", "admin"],
  "license.rotate": ["owner", "admin"],
  "finance.manage": ["owner", "admin", "finance"],
  "team.manage": ["owner", "admin"],
  "system.manage": ["owner"],
  "module.view": ["owner", "admin", "technical", "finance", "viewer"],
};

export class PermissionError extends Error {
  readonly status = 403;
}

export function hasPermission(
  role: MembershipRole | null,
  action: PermissionAction
): boolean {
  return role !== null && MATRIX[action].includes(role);
}

/** Rolün atayabileceği roller: Owner her rolü, Admin yalnız alt rolleri verir. */
export function assignableRolesFor(role: MembershipRole): MembershipRole[] {
  if (role === "owner") {
    return ["owner", "admin", "technical", "finance", "viewer"];
  }
  if (role === "admin") {
    return ["technical", "finance", "viewer"];
  }
  return [];
}

export type AuthorizedContext = AuthContext & {
  workspaceId: string;
  role: MembershipRole;
};

/**
 * Her Server Action girişinde çağrılır. Yetkisiz erişimde güvenlik günlüğü
 * oluşturur ve PermissionError (403) fırlatır.
 */
export async function requirePermission(
  action: PermissionAction
): Promise<AuthorizedContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    throw new PermissionError("Bu işlem için oturum açmanız gerekiyor.");
  }
  if (!ctx.workspaceId || !ctx.role) {
    throw new PermissionError(
      "Aktif çalışma alanı bulunamadı veya üyeliğiniz pasif durumda."
    );
  }
  if (!hasPermission(ctx.role, action)) {
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
