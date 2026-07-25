import { getAuthContext } from "@/lib/auth/context";
import { hasPermission, assignableRolesFor } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/page-header";
import {
  TeamView,
  type WorkspaceItem,
  type MemberItem,
} from "@/components/ekip/team-view";

export const metadata = { title: "Ekip · Operasyon Merkezi" };

export default async function TeamPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const memberships = await prisma.workspaceUser.findMany({
    where: { user_id: ctx.user.id },
    include: { workspace: { select: { id: true, name: true, deleted_at: true } } },
  });

  const workspaces: WorkspaceItem[] = memberships
    .filter((m) => !m.workspace.deleted_at)
    .map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      role: m.role,
      active: m.status === "active",
    }));

  let members: MemberItem[] = [];
  if (ctx.workspaceId) {
    const rows = await prisma.workspaceUser.findMany({
      where: { workspace_id: ctx.workspaceId },
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

  const canManage = hasPermission(ctx.role, "team.manage");
  const assignableRoles = ctx.role ? assignableRolesFor(ctx.role) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Ekip ve Çalışma Alanı" description="Çalışma alanlarını ve ekip üyelerini yönetin." />
      <TeamView
        workspaces={workspaces}
        currentWorkspaceId={ctx.workspaceId ?? ""}
        members={members}
        assignableRoles={assignableRoles}
        canManage={canManage}
      />
    </div>
  );
}
