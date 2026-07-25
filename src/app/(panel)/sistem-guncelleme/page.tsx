import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { Package, GitBranch } from "lucide-react";

export const metadata = { title: "Sistem Özellikleri · Operasyon Merkezi" };

export default async function SystemUpdatePage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx?.role ?? null, "system.manage")) {
    redirect("/dashboard");
  }

  const version = process.env.APP_VERSION ?? "1.0.0";
  const nodeVersion = process.version;

  return (
    <div className="space-y-6">
      <PageHeader title="Sistem Özellikleri" description="Sürüm bilgisi ve çalışma ortamı (yalnızca Owner)." />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[22px] border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5267ff]/10 text-[#5267ff]">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Uygulama Sürümü</p>
              <p className="text-xl font-extrabold text-[#141821]">v{version}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <GitBranch className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Çalışma Ortamı</p>
              <p className="text-xl font-extrabold text-[#141821]">Node {nodeVersion}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
