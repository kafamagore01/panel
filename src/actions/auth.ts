"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { signIn, signOut } from "@/lib/auth";
import { getAuthContext } from "@/lib/auth/context";
import { createOtp, verifyOtp, OTP_TTL_MS } from "@/lib/auth/otp";
import {
  isLoginLocked,
  registerLoginFailure,
  clearLoginFailures,
} from "@/lib/auth/login-limiter";
import { getRequestMeta, writeAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { otpEmail } from "@/lib/email/templates";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";

const OTP_TICKET_COOKIE = "otp_ticket";

const loginSchema = z.object({
  email: z.email("Geçerli bir e-posta adresi girin."),
  password: z.string().min(1, "Parola zorunludur."),
});

const otpSchema = z.object({
  code: z
    .string()
    .regex(/^\d{6}$/, "Kod 6 haneli olmalıdır."),
});

async function setTicketCookie(ticket: string): Promise<void> {
  (await cookies()).set(OTP_TICKET_COOKIE, ticket, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(OTP_TTL_MS / 1000),
    path: "/",
  });
}

export async function loginAction(
  input: unknown
): Promise<ActionResponse<{ requiresOtp: boolean }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  const email = parsed.data.email.trim().toLowerCase();
  const { password } = parsed.data;
  const { ip } = await getRequestMeta();

  if (await isLoginLocked(email, ip)) {
    return fail(
      "Çok fazla başarısız deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin."
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user
    ? await bcrypt.compare(password, user.password_hash)
    : false;

  if (!user || !valid) {
    await registerLoginFailure(email, ip);
    return fail("E-posta veya parola hatalı.");
  }

  // Hesap anahtarı temizlenir; paylaşılan IP sayacı geçerli bir hesapla
  // sıfırlanamaz ve pencere sonuna kadar saldırı sinyalini korur.
  await clearLoginFailures(email);

  if (user.two_factor_enabled_at) {
    const { id, code } = await createOtp(user.id, "login");
    const mail = otpEmail(code);
    try {
      await sendEmail({ to: user.email, ...mail });
    } catch (error) {
      console.error("OTP e-postası gönderilemedi:", error);
      return fail("Doğrulama kodu gönderilemedi. Lütfen tekrar deneyin.");
    }
    await setTicketCookie(id);
    return ok(
      { requiresOtp: true },
      "Doğrulama kodu e-posta adresinize gönderildi."
    );
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch {
    return fail("Giriş yapılamadı. Lütfen tekrar deneyin.");
  }

  await writeAudit({
    actor_user_id: user.id,
    action: "LOGIN",
    auditable_type: "user",
    auditable_id: user.id,
  });
  return ok({ requiresOtp: false }, "Giriş başarılı.");
}

export async function verifyOtpAction(
  input: unknown
): Promise<ActionResponse<null>> {
  const parsed = otpSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  const store = await cookies();
  const ticket = store.get(OTP_TICKET_COOKIE)?.value;
  if (!ticket) {
    return fail("Doğrulama oturumu bulunamadı. Lütfen yeniden giriş yapın.");
  }

  const result = await verifyOtp(ticket, "login", parsed.data.code);
  if (!result.ok) return fail(result.error);

  try {
    await signIn("credentials", { ticket, redirect: false });
  } catch {
    return fail("Oturum açılamadı. Lütfen yeniden giriş yapın.");
  }

  store.delete(OTP_TICKET_COOKIE);
  await writeAudit({
    actor_user_id: result.userId,
    action: "LOGIN_2FA",
    auditable_type: "user",
    auditable_id: result.userId,
  });
  return ok(null, "Giriş başarılı.");
}

export async function resendOtpAction(): Promise<ActionResponse<null>> {
  const store = await cookies();
  const ticket = store.get(OTP_TICKET_COOKIE)?.value;
  if (!ticket) {
    return fail("Doğrulama oturumu bulunamadı. Lütfen yeniden giriş yapın.");
  }

  const record = await prisma.otpCode.findUnique({
    where: { id: ticket },
    include: { user: true },
  });
  if (!record || record.purpose !== "login" || record.consumed_at) {
    return fail("Doğrulama oturumu geçersiz. Lütfen yeniden giriş yapın.");
  }
  // Spam koruması: 60 saniyede bir yeni kod
  if (Date.now() - record.created_at.getTime() < 60_000) {
    return fail("Yeni kod istemek için lütfen biraz bekleyin.");
  }

  const { id, code } = await createOtp(record.user_id, "login");
  const mail = otpEmail(code);
  try {
    await sendEmail({ to: record.user.email, ...mail });
  } catch (error) {
    console.error("OTP e-postası gönderilemedi:", error);
    return fail("Doğrulama kodu gönderilemedi. Lütfen tekrar deneyin.");
  }
  await setTicketCookie(id);
  return ok(null, "Yeni doğrulama kodu gönderildi.");
}

export async function logoutAction(): Promise<ActionResponse<null>> {
  const ctx = await getAuthContext();
  const store = await cookies();
  const currentToken =
    store.get("authjs.session-token")?.value ??
    store.get("__Secure-authjs.session-token")?.value;

  if (currentToken) {
    try {
      await prisma.session.deleteMany({
        where: {
          session_token: currentToken,
          ...(ctx ? { user_id: ctx.user.id } : {}),
        },
      });
    } catch (error) {
      console.error("Oturum sunucuda iptal edilemedi:", error);
      return fail(
        "Oturum güvenli biçimde sonlandırılamadı. Lütfen tekrar deneyin."
      );
    }
  }

  try {
    await signOut({ redirect: false });
  } catch (error) {
    // DB tokenı yukarıda iptal edildi; cookie temizliği yenilemede tamamlanır.
    console.error("Çıkış cookie temizliği tamamlanamadı:", error);
  }
  if (ctx) {
    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "LOGOUT",
      auditable_type: "user",
      auditable_id: ctx.user.id,
    });
  }
  return ok(null, "Oturum kapatıldı.");
}
