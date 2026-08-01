import { AuthHeading } from "@/components/auth/auth-heading";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Giriş · Operasyon Merkezi" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string }>;
}) {
  const { durum } = await searchParams;
  const sessionEnded = durum === "oturum-sonlandi";

  return (
    <>
      <AuthHeading
        title="Tekrar hoş geldiniz"
        subtitle={
          sessionEnded
            ? "Oturumunuz sona erdi. Devam etmek için tekrar giriş yapın."
            : "Devam etmek için hesabınıza giriş yapın."
        }
      />
      <LoginForm />
    </>
  );
}
