"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyOtpAction, resendOtpAction } from "@/actions/auth";

export function OtpForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isResending, startResend] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const code = String(form.get("code") ?? "");
    startTransition(async () => {
      const res = await verifyOtpAction({ code });
      if (!res.success) {
        setError(res.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  function onResend() {
    setError(null);
    startResend(async () => {
      const res = await resendOtpAction();
      if (res.success) toast.success(res.message ?? "Yeni kod gönderildi.");
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code">Doğrulama Kodu</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          placeholder="000000"
          className="text-center text-2xl font-extrabold tracking-[0.5em]"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="w-full bg-[#5267ff] hover:bg-[#4254e1]"
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Doğrula ve Giriş Yap
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onResend}
          disabled={isResending}
          className="font-medium text-[#5267ff] hover:underline disabled:opacity-50"
        >
          Kodu Yeniden Gönder
        </button>
        <button
          type="button"
          onClick={() => router.push("/giris")}
          className="text-muted-foreground hover:underline"
        >
          Girişe Dön
        </button>
      </div>
    </form>
  );
}
