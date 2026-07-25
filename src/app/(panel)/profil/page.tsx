import { getAuthContext } from "@/lib/auth/context";
import { PageHeader } from "@/components/page-header";
import { ProfileView } from "@/components/profil/profile-view";

export const metadata = { title: "Profil · Operasyon Merkezi" };

export default async function ProfilePage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profil & Güvenlik"
        description="Hesap bilgilerinizi ve güvenlik ayarlarınızı yönetin."
      />
      <ProfileView
        name={ctx.user.name}
        email={ctx.user.email}
        avatarUrl={ctx.user.avatar_url}
        twoFactorEnabled={ctx.user.two_factor_enabled}
        forcePasswordReset={ctx.user.force_password_reset}
      />
    </div>
  );
}
