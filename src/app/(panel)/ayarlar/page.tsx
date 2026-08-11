import { getAuthContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { getEffectivePermissions, hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { GithubCard } from "@/components/ayarlar/github-card";
import { getConnectionSummary } from "@/lib/github/connection";
import { isOAuthConfigured } from "@/lib/github/oauth";

export const metadata = { title: "Ayarlar · Operasyon Merkezi" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.workspaceId || !ctx.role) redirect("/yetkisiz");
  const permissions = await getEffectivePermissions(ctx.workspaceId, ctx.role);
  if (!hasPermission(ctx.role, "settings.view", permissions)) redirect("/yetkisiz");

  const { github: notice } = await searchParams;
  const connection = ctx.workspaceId
    ? await getConnectionSummary(ctx.workspaceId)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ayarlar"
        description="Çalışma alanı entegrasyonlarını yönetin."
      />
      <GithubCard
        connection={connection}
        oauthEnabled={isOAuthConfigured()}
        canManage={hasPermission(ctx.role, "settings.update", permissions)}
        notice={notice}
      />
    </div>
  );
}
