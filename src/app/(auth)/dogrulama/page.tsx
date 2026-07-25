import { AuthHeading } from "@/components/auth/auth-heading";
import { OtpForm } from "@/components/auth/otp-form";

export const metadata = { title: "Doğrulama · Operasyon Merkezi" };

export default function VerifyPage() {
  return (
    <>
      <AuthHeading
        title="İki adımlı doğrulama"
        subtitle="E-posta adresinize gönderilen 6 haneli kodu girin."
      />
      <OtpForm />
    </>
  );
}
