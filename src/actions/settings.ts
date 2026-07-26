"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  getAuthContext,
  isPasswordResetRequired,
  PASSWORD_RESET_REQUIRED_MESSAGE,
} from "@/lib/auth/context";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { otpEmail } from "@/lib/email/templates";
import { createOtp, verifyOtp } from "@/lib/auth/otp";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";
import {
  isValidAvatarDataUrl,
  isValidRemoteAvatarUrl,
  MAX_AVATAR_DATA_URL_LENGTH,
} from "@/lib/avatar";

const TFA_COOKIE = "tfa_ticket";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Ad en az 2 karakter olmalıdır.").max(150),
  avatar_url: z
    .union([
      z.null(),
      z
        .string()
        .max(MAX_AVATAR_DATA_URL_LENGTH, "Profil fotoğrafı çok büyük.")
        .refine(
          (value) =>
            isValidAvatarDataUrl(value) || isValidRemoteAvatarUrl(value),
          "Profil fotoğrafı geçerli bir görsel veya HTTPS görsel URL'si olmalıdır."
        ),
    ])
    .optional(),
});

export async function updateProfile(
  input: unknown
): Promise<ActionResponse<null>> {
  const ctx = await getAuthContext();
  if (!ctx) return fail("Oturum bulunamadı.");
  if (isPasswordResetRequired(ctx)) {
    return fail(PASSWORD_RESET_REQUIRED_MESSAGE);
  }
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  await prisma.user.update({
    where: { id: ctx.user.id },
    data: {
      name: parsed.data.name,
      ...(parsed.data.avatar_url !== undefined
        ? { avatar_url: parsed.data.avatar_url }
        : {}),
    },
  });

  await writeAudit({
    workspace_id: ctx.workspaceId,
    actor_user_id: ctx.user.id,
    action: "UPDATE_PROFILE",
    auditable_type: "user",
    auditable_id: ctx.user.id,
  });

  revalidatePath("/ayarlar");
  return ok(null, "Profil güncellendi.");
}

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Mevcut parola zorunludur."),
    new_password: z
      .string()
      .min(8, "Yeni parola en az 8 karakter olmalıdır.")
      .max(200),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Parolalar eşleşmiyor.",
    path: ["confirm_password"],
  });

/** Parola değiştir; diğer tüm oturumları sonlandırır (mevcut oturum korunur). */
export async function changePassword(
  input: unknown
): Promise<ActionResponse<null>> {
  const ctx = await getAuthContext();
  if (!ctx) return fail("Oturum bulunamadı.");
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
  if (!user) return fail("Kullanıcı bulunamadı.");

  const valid = await bcrypt.compare(parsed.data.current_password, user.password_hash);
  if (!valid) return fail("Mevcut parolanız hatalı.");

  const password_hash = await bcrypt.hash(parsed.data.new_password, 12);
  const store = await cookies();
  const currentToken =
    store.get("authjs.session-token")?.value ??
    store.get("__Secure-authjs.session-token")?.value;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: ctx.user.id },
      data: { password_hash, force_password_reset: false },
    });
    await tx.session.deleteMany({
      where: {
        user_id: ctx.user.id,
        ...(currentToken ? { session_token: { not: currentToken } } : {}),
      },
    });
  });

  await writeAudit({
    workspace_id: ctx.workspaceId,
    actor_user_id: ctx.user.id,
    action: "CHANGE_PASSWORD",
    auditable_type: "user",
    auditable_id: ctx.user.id,
  });

  return ok(null, "Parolanız değiştirildi. Diğer oturumlar sonlandırıldı.");
}

/** 2FA aç/kapat için OTP gönderir. */
export async function request2FAChange(
  enable: boolean
): Promise<ActionResponse<null>> {
  const ctx = await getAuthContext();
  if (!ctx) return fail("Oturum bulunamadı.");
  if (isPasswordResetRequired(ctx)) {
    return fail(PASSWORD_RESET_REQUIRED_MESSAGE);
  }

  if (enable && ctx.user.two_factor_enabled) {
    return fail("İki adımlı doğrulama zaten açık.");
  }
  if (!enable && !ctx.user.two_factor_enabled) {
    return fail("İki adımlı doğrulama zaten kapalı.");
  }

  const purpose = enable ? "enable_2fa" : "disable_2fa";
  const { id, code } = await createOtp(ctx.user.id, purpose);
  const mail = otpEmail(code);
  try {
    await sendEmail({ to: ctx.user.email, ...mail });
  } catch (error) {
    console.error("2FA OTP gönderilemedi:", error);
    return fail("Doğrulama kodu gönderilemedi.");
  }

  (await cookies()).set(TFA_COOKIE, `${purpose}:${id}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  return ok(null, "Doğrulama kodu e-posta adresinize gönderildi.");
}

const confirm2FASchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Kod 6 haneli olmalıdır."),
});

export async function confirm2FAChange(
  input: unknown
): Promise<ActionResponse<{ enabled: boolean }>> {
  const ctx = await getAuthContext();
  if (!ctx) return fail("Oturum bulunamadı.");
  if (isPasswordResetRequired(ctx)) {
    return fail(PASSWORD_RESET_REQUIRED_MESSAGE);
  }
  const parsed = confirm2FASchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  const store = await cookies();
  const raw = store.get(TFA_COOKIE)?.value;
  if (!raw) return fail("Doğrulama isteği bulunamadı. Yeniden başlatın.");
  const [purpose, otpId] = raw.split(":");
  if (purpose !== "enable_2fa" && purpose !== "disable_2fa") {
    return fail("Doğrulama isteği geçersiz.");
  }

  const result = await verifyOtp(otpId, purpose, parsed.data.code);
  if (!result.ok) return fail(result.error);
  if (result.userId !== ctx.user.id) {
    store.delete(TFA_COOKIE);
    return fail("Doğrulama isteği bu kullanıcıya ait değil.");
  }

  const enable = purpose === "enable_2fa";
  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { two_factor_enabled_at: enable ? new Date() : null },
  });
  store.delete(TFA_COOKIE);

  await writeAudit({
    workspace_id: ctx.workspaceId,
    actor_user_id: ctx.user.id,
    action: enable ? "ENABLE_2FA" : "DISABLE_2FA",
    auditable_type: "user",
    auditable_id: ctx.user.id,
  });

  revalidatePath("/ayarlar");
  return ok(
    { enabled: enable },
    enable ? "İki adımlı doğrulama açıldı." : "İki adımlı doğrulama kapatıldı."
  );
}
