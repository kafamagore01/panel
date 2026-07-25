import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/ayarlar/settings-view";
import { getConnectionSummary } from "@/lib/github/connection";
import { isOAuthConfigured } from "@/lib/github/oauth";

export const metadata = { title: "Ayarlar · Operasyon Merkezi" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const { github: notice } = await searchParams;
  const connection = ctx.workspaceId
    ? await getConnectionSummary(ctx.workspaceId)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Profil & Güvenlik" description="Hesap bilgilerinizi, güvenlik ayarlarınızı ve entegrasyonları yönetin." />
      <SettingsView
        name={ctx.user.name}
        email={ctx.user.email}
        twoFactorEnabled={ctx.user.two_factor_enabled}
        forcePasswordReset={ctx.user.force_password_reset}
        github={{
          connection,
          oauthEnabled: isOAuthConfigured(),
          canManage: hasPermission(ctx.role, "system.manage"),
          notice,
        }}
      />
    </div>
  );
}
