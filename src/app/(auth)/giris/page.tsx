import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Giriş · Operasyon Merkezi" };

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-extrabold text-[#141821]">Hesabınıza Giriş Yapın</h2>
        <p className="text-sm text-muted-foreground">
          E-posta ve parolanızla oturum açın.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
