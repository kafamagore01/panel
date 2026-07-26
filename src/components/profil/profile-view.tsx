"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Camera,
  ImageUp,
  Link2,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
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

export function ProfileView({
  name,
  email,
  avatarUrl,
  twoFactorEnabled,
  forcePasswordReset,
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
  twoFactorEnabled: boolean;
  forcePasswordReset: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ProfileCard name={name} email={email} avatarUrl={avatarUrl} />
      <PasswordCard forceReset={forcePasswordReset} />
      <TwoFactorCard enabled={twoFactorEnabled} />
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

const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;
const AVATAR_SIZE = 256;
const MAX_PREPARED_AVATAR_SIZE = 96 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Görsel okunamadı."));
    image.src = source;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Görsel işlenemedi."));
    reader.readAsDataURL(blob);
  });
}

async function prepareAvatar(file: File): Promise<string> {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    throw new Error("Yalnızca JPG, PNG veya WEBP dosyası seçebilirsiniz.");
  }
  if (file.size > MAX_AVATAR_FILE_SIZE) {
    throw new Error("Profil fotoğrafı en fazla 5 MB olabilir.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("Görselin boyutları okunamadı.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Görsel işlenemedi.");

    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.78)
    );
    if (!blob) throw new Error("Görsel işlenemedi.");
    if (blob.size > MAX_PREPARED_AVATAR_SIZE) {
      throw new Error(
        "İşlenen profil fotoğrafı çok büyük. Daha sade bir görsel seçin."
      );
    }

    return blobToDataUrl(blob);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function ProfileCard({
  name,
  email,
  avatarUrl: initialAvatarUrl,
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(name);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarSourceUrl, setAvatarSourceUrl] = useState("");
  const [avatarError, setAvatarError] = useState<string>();
  const [isPreparingAvatar, setIsPreparingAvatar] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  async function selectAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAvatarError(undefined);
    setIsPreparingAvatar(true);
    try {
      setAvatarUrl(await prepareAvatar(file));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Profil fotoğrafı işlenemedi.";
      setAvatarError(message);
      toast.error(message);
    } finally {
      setIsPreparingAvatar(false);
    }
  }

  function importAvatarFromUrl() {
    const sourceUrl = avatarSourceUrl.trim();
    if (!sourceUrl) return;

    setAvatarError(undefined);
    try {
      const url = new URL(sourceUrl);
      if (
        url.protocol !== "https:" ||
        url.username.length > 0 ||
        url.password.length > 0
      ) {
        throw new Error("Geçerli bir HTTPS görsel URL'si girin.");
      }
      setAvatarUrl(url.toString());
      setAvatarSourceUrl("");
      toast.success("Görsel URL'si eklendi. Kaydetmeyi unutmayın.");
    } catch {
      const message = "Geçerli bir HTTPS görsel URL'si girin.";
      setAvatarError(message);
      toast.error(message);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await updateProfile({ name: value, avatar_url: avatarUrl });
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
    <Card title="Profil" description="Profil fotoğrafınızı ve ad soyad bilginizi güncelleyin.">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
          <div className="relative w-fit shrink-0">
            <Avatar className="h-20 w-20 border-4 border-white shadow-sm">
              {avatarUrl && (
                <AvatarImage
                  src={avatarUrl}
                  alt={`${value || name} profil fotoğrafı`}
                  className="object-cover"
                />
              )}
              <AvatarFallback className="bg-[#5267ff] text-xl font-bold text-white">
                {initials(value || name)}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPreparingAvatar || isPending}
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#5267ff] text-white shadow-sm transition hover:bg-[#4254e1] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Profil fotoğrafı seç"
            >
              {isPreparingAvatar ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[#141821]">Profil fotoğrafı</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              JPG, PNG veya WEBP · En fazla 5 MB
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPreparingAvatar || isPending}
              >
                {isPreparingAvatar ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ImageUp className="mr-2 h-4 w-4" />
                )}
                Fotoğraf seç
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAvatarUrl(null);
                    setAvatarError(undefined);
                  }}
                  disabled={isPreparingAvatar || isPending}
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Kaldır
                </Button>
              )}
            </div>
            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="mb-2 text-xs font-medium text-slate-600">
                veya görsel URL’si kullanın
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                Görsel kaynak siteden gösterilir; uygulamaya kopyalanmaz.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="url"
                  value={avatarSourceUrl}
                  onChange={(e) => setAvatarSourceUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      importAvatarFromUrl();
                    }
                  }}
                  placeholder="https://site.com/fotograf.jpg"
                  aria-label="Profil fotoğrafı URL'si"
                  disabled={isPending}
                  className="h-9 bg-white text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={importAvatarFromUrl}
                  disabled={
                    !avatarSourceUrl.trim() ||
                    isPreparingAvatar ||
                    isPending
                  }
                  className="shrink-0"
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  URL’den ekle
                </Button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={selectAvatar}
              disabled={isPreparingAvatar || isPending}
              className="sr-only"
              aria-label="Profil fotoğrafı yükle"
            />
            {avatarError && (
              <p className="mt-2 text-xs font-medium text-rose-600">
                {avatarError}
              </p>
            )}
            {errors.avatar_url?.map((error) => (
              <p key={error} className="mt-2 text-xs font-medium text-rose-600">
                {error}
              </p>
            ))}
          </div>
        </div>
        <Field label="Ad Soyad" error={errors.name} required>
          <Input value={value} onChange={(e) => setValue(e.target.value)} required />
        </Field>
        <Field label="E-posta">
          <Input value={email} disabled />
        </Field>
        <Button
          type="submit"
          disabled={isPending || isPreparingAvatar}
          className="bg-[#5267ff] hover:bg-[#4254e1]"
        >
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
