"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { loginAction } from "@/actions/auth";
import { DoorButton, playDoorSequence, wait, type DoorPhase } from "./door-button";
import styles from "./lunara.module.css";

export function LoginForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<DoorPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase !== "idle") return;
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    // İstek ile kapı animasyonu eş zamanlı ilerler; reddi hemen yakalarız ki
    // animasyon beklenirken "unhandled rejection" oluşmasın.
    const pending = loginAction(payload).catch((err: unknown) => {
      console.error("Giriş isteği başarısız:", err);
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

    if (res.data.requiresOtp) {
      toast.success(res.message ?? "Doğrulama kodu gönderildi.");
      router.push("/dogrulama");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  const busy = phase !== "idle";

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      <div className={styles.field}>
        <input
          id="email"
          name="email"
          type="email"
          className={styles.input}
          autoComplete="username"
          placeholder=" "
          required
          disabled={busy}
        />
        <label htmlFor="email" className={styles.label}>
          E-posta
        </label>
      </div>

      <div className={styles.field}>
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          className={`${styles.input} ${styles.hasReveal}`}
          autoComplete="current-password"
          placeholder=" "
          required
          disabled={busy}
        />
        <label htmlFor="password" className={styles.label}>
          Parola
        </label>
        <button
          type="button"
          className={`${styles.reveal} ${showPassword ? styles.isOn : ""}`}
          aria-pressed={showPassword}
          aria-label={showPassword ? "Parolayı gizle" : "Parolayı göster"}
          onClick={() => setShowPassword((v) => !v)}
        >
          <svg
            className={styles.iconOn}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <svg
            className={styles.iconOff}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M3 3l18 18" />
            <path d="M10.6 6.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.2 6.3A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4-.9" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        </button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <DoorButton phase={phase} label="Giriş Yap" />

      <p className={styles.status} role="status" aria-live="polite">
        {phase === "success" ? "Hoş geldiniz!" : busy ? "Giriş yapılıyor…" : ""}
      </p>
    </form>
  );
}
