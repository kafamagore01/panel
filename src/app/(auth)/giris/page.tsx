import { AuthHeading } from "@/components/auth/auth-heading";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Giriş · Operasyon Merkezi" };

export default function LoginPage() {
  return (
    <>
      <AuthHeading
        title="Tekrar hoş geldiniz"
        subtitle="Devam etmek için hesabınıza giriş yapın."
      />
      <LoginForm />
    </>
  );
}
