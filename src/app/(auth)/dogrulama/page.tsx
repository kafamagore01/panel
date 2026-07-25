import { OtpForm } from "@/components/auth/otp-form";

export const metadata = { title: "Doğrulama · Operasyon Merkezi" };

export default function VerifyPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-extrabold text-[#141821]">İki Adımlı Doğrulama</h2>
        <p className="text-sm text-muted-foreground">
          E-posta adresinize gönderilen 6 haneli kodu girin.
        </p>
      </div>
      <OtpForm />
    </div>
  );
}
