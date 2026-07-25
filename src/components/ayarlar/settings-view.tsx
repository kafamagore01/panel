"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/form-field";
import {
  updateProfile,
  changePassword,
  request2FAChange,
  confirm2FAChange,
} from "@/actions/settings";
import { useRouter } from "next/navigation";
import { GithubCard } from "@/components/ayarlar/github-card";
import type { GithubConnectionSummary } from "@/lib/github/connection";

export function SettingsView({
  name,
  email,
  twoFactorEnabled,
  forcePasswordReset,
  github,
}: {
  name: string;
  email: string;
  twoFactorEnabled: boolean;
  forcePasswordReset: boolean;
  github: {
    connection: GithubConnectionSummary | null;
    oauthEnabled: boolean;
    canManage: boolean;
    notice?: string;
  };
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ProfileCard name={name} email={email} />
      <PasswordCard forceReset={forcePasswordReset} />
      <TwoFactorCard enabled={twoFactorEnabled} />
      <GithubCard
        connection={github.connection}
        oauthEnabled={github.oauthEnabled}
        canManage={github.canManage}
        notice={github.notice}
      />
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white p-6 shadow-sm">
      <h2 className="font-extrabold text-[#141821]">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ProfileCard({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await updateProfile({ name: value });
      if (res.success) {
        toast.success(res.message ?? "Güncellendi.");
        router.refresh();
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
      }
    });
  }

  return (
    <Card title="Profil" description="Ad soyad bilgilerinizi güncelleyin.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Ad Soyad" error={errors.name} required>
          <Input value={value} onChange={(e) => setValue(e.target.value)} required />
        </Field>
        <Field label="E-posta">
          <Input value={email} disabled />
        </Field>
        <Button type="submit" disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Kaydet
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard({ forceReset }: { forceReset: boolean }) {
  const [values, setValues] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function set(key: keyof typeof values, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await changePassword(values);
      if (res.success) {
        toast.success(res.message ?? "Değiştirildi.");
        setValues({ current_password: "", new_password: "", confirm_password: "" });
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
      }
    });
  }

  return (
    <Card title="Parola" description="Parolanızı değiştirdiğinizde diğer oturumlar sonlandırılır.">
      {forceReset && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Güvenlik nedeniyle parolanızı değiştirmeniz gerekmektedir.
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Mevcut Parola" error={errors.current_password} required>
          <Input type="password" value={values.current_password} onChange={(e) => set("current_password", e.target.value)} required />
        </Field>
        <Field label="Yeni Parola" error={errors.new_password} required>
          <Input type="password" value={values.new_password} onChange={(e) => set("new_password", e.target.value)} required />
        </Field>
        <Field label="Yeni Parola (Tekrar)" error={errors.confirm_password} required>
          <Input type="password" value={values.confirm_password} onChange={(e) => set("confirm_password", e.target.value)} required />
        </Field>
        <Button type="submit" disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Parolayı Değiştir
        </Button>
      </form>
    </Card>
  );
}

function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();

  function requestChange() {
    startTransition(async () => {
      const res = await request2FAChange(!enabled);
      if (res.success) {
        toast.success(res.message ?? "Kod gönderildi.");
        setCode("");
        setDialogOpen(true);
      } else {
        toast.error(res.error);
      }
    });
  }

  function confirm() {
    startTransition(async () => {
      const res = await confirm2FAChange({ code });
      if (res.success) {
        toast.success(res.message ?? "Güncellendi.");
        setDialogOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card title="İki Adımlı Doğrulama (2FA)" description="Girişlerde e-posta ile 6 haneli kod doğrulaması.">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-3">
          {enabled ? (
            <ShieldCheck className="h-8 w-8 text-emerald-600" />
          ) : (
            <ShieldOff className="h-8 w-8 text-slate-400" />
          )}
          <div>
            <p className="font-semibold text-[#141821]">{enabled ? "Açık" : "Kapalı"}</p>
            <p className="text-xs text-muted-foreground">
              {enabled ? "Hesabınız ek güvenlikle korunuyor." : "Hesabınızı güçlendirmek için açın."}
            </p>
          </div>
        </div>
        <Button
          variant={enabled ? "outline" : "default"}
          onClick={requestChange}
          disabled={isPending}
          className={enabled ? "" : "bg-[#5267ff] hover:bg-[#4254e1]"}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {enabled ? "Kapat" : "Aç"}
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Doğrulama Kodu</DialogTitle>
            <DialogDescription>E-posta adresinize gönderilen 6 haneli kodu girin.</DialogDescription>
          </DialogHeader>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            inputMode="numeric"
            placeholder="000000"
            className="text-center text-2xl font-extrabold tracking-[0.5em]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>Vazgeç</Button>
            <Button onClick={confirm} disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Doğrula
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
