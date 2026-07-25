import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { NAV_ITEMS } from "@/lib/navigation";
import { roleLabel } from "@/lib/roles";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SystemStatus } from "@/components/layout/system-status";
import { UserMenu } from "@/components/layout/user-menu";
import {
  WorkspaceBadge,
  type WorkspaceOption,
} from "@/components/layout/workspace-badge";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/giris");

  // Aktif workspace yoksa ekip sayfasına yönlendir (workspace oluştur/seç)
  if (!ctx.workspaceId || !ctx.role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] p-6">
        <div className="max-w-md rounded-[22px] border border-slate-200/80 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-extrabold text-[#141821]">
            Çalışma Alanı Bulunamadı
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Aktif bir çalışma alanınız yok veya üyeliğiniz pasif durumda.
            Lütfen bir yöneticiyle iletişime geçin.
          </p>
        </div>
      </div>
    );
  }

  if (ctx.user.force_password_reset) redirect("/ayarlar?parola=zorunlu");

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.requires || hasPermission(ctx.role, item.requires)
  );

  // Üst bardaki seçici için kullanıcının geçiş yapabileceği aktif üyelikler
  const memberships = await prisma.workspaceUser.findMany({
    where: { user_id: ctx.user.id, status: "active" },
    include: { workspace: { select: { id: true, name: true, deleted_at: true } } },
    orderBy: { created_at: "asc" },
  });
  const workspaces: WorkspaceOption[] = memberships
    .filter((m) => !m.workspace.deleted_at)
    .map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role }));

  return (
    <div className="flex min-h-screen bg-[#f4f5f7]">
      <SidebarNav items={visibleItems} workspaceName={ctx.workspaceName ?? ""} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-[#f4f5f7]/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <MobileNav items={visibleItems} workspaceName={ctx.workspaceName ?? ""} />
            <WorkspaceBadge
              workspaces={workspaces}
              currentId={ctx.workspaceId}
              currentName={ctx.workspaceName ?? ""}
            />
          </div>
          <div className="flex items-center gap-3">
            <SystemStatus />
            <UserMenu
              name={ctx.user.name}
              email={ctx.user.email}
              role={roleLabel(ctx.role)}
            />
          </div>
        </header>

        <main className="page-transition flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
