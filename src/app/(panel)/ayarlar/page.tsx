import { getAuthContext } from "@/lib/auth/context";
import { PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/ayarlar/settings-view";

export const metadata = { title: "Ayarlar · Operasyon Merkezi" };

export default async function SettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Profil & Güvenlik" description="Hesap bilgilerinizi ve güvenlik ayarlarınızı yönetin." />
      <SettingsView
        name={ctx.user.name}
        email={ctx.user.email}
        twoFactorEnabled={ctx.user.two_factor_enabled}
        forcePasswordReset={ctx.user.force_password_reset}
      />
    </div>
  );
}
