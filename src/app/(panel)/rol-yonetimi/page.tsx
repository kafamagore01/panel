import { redirect } from "next/navigation";
import type { MembershipRole } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import {
  RolePermissionsView,
  type RolePermissionProfile,
} from "@/components/rol-yonetimi/role-permissions-view";
import { getAuthContext } from "@/lib/auth/context";
import { IMMUTABLE_ROLES } from "@/lib/auth/permission-catalog";
import { getEffectivePermissions, hasPermission } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/roles";

const ROLES: MembershipRole[] = ["owner", "admin", "technical", "finance", "viewer"];

export default async function RoleManagementPage() {
  const ctx = await getAuthContext();
  if (
    !ctx?.workspaceId ||
    !ctx.role ||
    !hasPermission(ctx.role, "roles.manage")
  ) {
    redirect("/dashboard");
  }

  const permissionLists = await Promise.all(
    ROLES.map((role) => getEffectivePermissions(ctx.workspaceId!, role))
  );
  const profiles: RolePermissionProfile[] = ROLES.map((role, index) => ({
    role,
    label: ROLE_LABELS[role],
    locked: IMMUTABLE_ROLES.includes(role),
    permissions: [...permissionLists[index]],
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rol Yönetimi"
        description="Rollerin görüntüleme, oluşturma, düzenleme ve silme yetkilerini çalışma alanına özel yönetin."
      />
      <RolePermissionsView profiles={profiles} />
    </div>
  );
}
