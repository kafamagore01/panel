import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getAuthContext,
  SessionUnavailableError,
  type AuthContext,
} from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
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

/** Zorunlu parola değişiminin yapıldığı, yönlendirmeden muaf tek sayfa. */
const PASSWORD_RESET_PATH = "/profil";

/** Panel dışına atmadan gösterilen tam sayfa bilgi kartı. */
function NoticeCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] p-6">
      <div className="max-w-md rounded-[22px] border border-slate-200/80 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-extrabold text-[#141821]">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let ctx: AuthContext | null;
  try {
    ctx = await getAuthContext();
  } catch (error) {
    // Veritabanı erişilemiyorsa çıkış yaptırmak yerine geçici hata gösterilir;
    // /giris'e atmak çerez hâlâ durduğu için sonsuz yönlendirmeye dönerdi.
    if (error instanceof SessionUnavailableError) {
      return (
        <NoticeCard
          title="Servis Geçici Olarak Kullanılamıyor"
          body="Oturumunuz doğrulanamadı çünkü veritabanına şu anda ulaşılamıyor. Birkaç dakika içinde tekrar deneyin; oturumunuz kapatılmadı."
        />
      );
    }
    throw error;
  }

  // Oturum gerçekten yok: çerez kalıntısı proxy tarafından /dashboard'a geri
  // yönlendirilmesin diye işaretli adrese gidilir (bkz. src/proxy.ts).
  if (!ctx) redirect("/giris?durum=oturum-sonlandi");

  // Aktif workspace yoksa ekip sayfasına yönlendir (workspace oluştur/seç)
  if (!ctx.workspaceId || !ctx.role) {
    return (
      <NoticeCard
        title="Çalışma Alanı Bulunamadı"
        body="Aktif bir çalışma alanınız yok veya üyeliğiniz pasif durumda. Lütfen bir yöneticiyle iletişime geçin."
      />
    );
  }

  // Parola değişimi zorunluyken panelin geri kalanı /profil'e yönlendirilir.
  // /profil de bu layout'u kullandığı için muaf tutulmazsa kendi kendine
  // yönlendirip sonsuz döngüye girer; hedef sayfa proxy'nin geçirdiği
  // pathname ile ayırt edilir.
  if (ctx.user.force_password_reset) {
    const pathname = (await headers()).get("x-pathname");
    if (pathname !== PASSWORD_RESET_PATH) {
      redirect(`${PASSWORD_RESET_PATH}?parola=zorunlu`);
    }
  }

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.requires || hasPermission(ctx.role, item.requires)
  );

  // Üst bardaki seçici için geçiş yapılabilir üyelikler: getAuthContext ile
  // aynı sorguda geldiği için burada ek round trip yok.
  const workspaces: WorkspaceOption[] = ctx.workspaces;

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
              avatarUrl={ctx.user.avatar_url}
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
