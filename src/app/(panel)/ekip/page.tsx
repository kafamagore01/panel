import { getAuthContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import {
  hasPermission,
  assignableRolesFor,
  getEffectivePermissions,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/page-header";
import {
  TeamView,
  type WorkspaceItem,
  type MemberItem,
} from "@/components/ekip/team-view";
import { FORM_OPTION_LIMIT } from "@/lib/pagination";

export const metadata = { title: "Ekip · Operasyon Merkezi" };

export default async function TeamPage() {
  const ctx = await getAuthContext();
  if (!ctx?.workspaceId || !ctx.role) redirect("/yetkisiz");

  const permissions = await getEffectivePermissions(ctx.workspaceId, ctx.role);
  const can = (action: Parameters<typeof hasPermission>[1]) =>
    hasPermission(ctx.role, action, permissions);
  const canViewMembers = can("team.view");
  const canViewWorkspaces = can("workspaces.view");
  if (!canViewMembers && !canViewWorkspaces) redirect("/yetkisiz");

  const memberships = canViewWorkspaces ? await prisma.workspaceUser.findMany({
    where: { user_id: ctx.user.id },
    take: FORM_OPTION_LIMIT,
    include: { workspace: { select: { id: true, name: true, deleted_at: true } } },
  }) : [];

  const workspaces: WorkspaceItem[] = memberships
    .filter((m) => !m.workspace.deleted_at)
    .map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      role: m.role,
      active: m.status === "active",
    }));

  let members: MemberItem[] = [];
  if (canViewMembers) {
    const rows = await prisma.workspaceUser.findMany({
      where: { workspace_id: ctx.workspaceId },
      take: FORM_OPTION_LIMIT,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { created_at: "asc" },
    });
    members = rows.map((r) => ({
      membership_id: r.id,
      name: r.user.name,
      email: r.user.email,
      role: r.role,
      status: r.status,
      is_self: r.user.id === ctx.user.id,
    }));
  }

  const canCreateMember = can("team.create");
  const canUpdateMember = can("team.update");
  const assignableRoles = canCreateMember || canUpdateMember ? assignableRolesFor(ctx.role) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Ekip ve Çalışma Alanı" description="Çalışma alanlarını ve ekip üyelerini yönetin." />
      <TeamView
        workspaces={workspaces}
        currentWorkspaceId={ctx.workspaceId ?? ""}
        members={members}
        assignableRoles={assignableRoles}
        canViewWorkspaces={canViewWorkspaces}
        canCreateWorkspace={can("workspaces.create")}
        canDeleteWorkspace={can("workspaces.delete")}
        canViewMembers={canViewMembers}
        canCreateMember={canCreateMember}
        canUpdateMember={canUpdateMember}
        canDeleteMember={can("team.delete")}
      />
    </div>
  );
}
