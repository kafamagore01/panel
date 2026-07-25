"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { verifyOtpAction, resendOtpAction } from "@/actions/auth";
import { DoorButton, playDoorSequence, wait, type DoorPhase } from "./door-button";
import styles from "./lunara.module.css";

export function OtpForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<DoorPhase>("idle");
  const [isResending, startResend] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase !== "idle") return;
    setError(null);

    const form = new FormData(e.currentTarget);
    const code = String(form.get("code") ?? "");

    // İstek ile kapı animasyonu eş zamanlı ilerler; reddi hemen yakalarız.
    const pending = verifyOtpAction({ code }).catch((err: unknown) => {
      console.error("Doğrulama isteği başarısız:", err);
      return null;
    });

    await playDoorSequence(setPhase);
    const res = await pending;

    if (!res) {
      setPhase("idle");
      setError("Sunucuya ulaşılamadı. Lütfen tekrar deneyin.");
      return;
    }
    if (!res.success) {
      setPhase("idle");
      setError(res.error);
      return;
    }

    setPhase("success");
    await wait(380);
    router.push("/dashboard");
    router.refresh();
  }

  function onResend() {
    setError(null);
    startResend(async () => {
      const res = await resendOtpAction();
      if (res.success) toast.success(res.message ?? "Yeni kod gönderildi.");
      else setError(res.error);
    });
  }

  const busy = phase !== "idle";

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      <div className={styles.field}>
        <input
          id="code"
          name="code"
          className={`${styles.input} ${styles.otpInput}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder=" "
          required
          disabled={busy}
        />
        <label htmlFor="code" className={styles.label}>
          Doğrulama kodu
        </label>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <DoorButton phase={phase} label="Doğrula ve Giriş Yap" />

      <p className={styles.status} role="status" aria-live="polite">
        {phase === "success" ? "Hoş geldiniz!" : busy ? "Doğrulanıyor…" : ""}
      </p>

      <div className={styles.linkRow}>
        <button
          type="button"
          className={styles.linkBtn}
          onClick={onResend}
          disabled={isResending || busy}
        >
          Kodu yeniden gönder
        </button>
        <button
          type="button"
          className={`${styles.linkBtn} ${styles.mutedLink}`}
          onClick={() => router.push("/giris")}
          disabled={busy}
        >
          Girişe dön
        </button>
      </div>
    </form>
  );
}
