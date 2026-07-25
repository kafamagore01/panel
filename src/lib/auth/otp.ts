import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { OtpPurpose, User } from "@/generated/prisma/client";

/**
 * E-posta OTP yönetimi.
 * Kod: 6 hane, 10 dakika geçerli, veritabanında HMAC-SHA256 ile hash'li,
 * en fazla 5 hatalı deneme.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
/** OTP doğrulaması ile oturum açma arasındaki azami süre (ticket ömrü). */
const TICKET_EXCHANGE_WINDOW_MS = 60 * 1000;

export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(code: string): string {
  const pepper = process.env.APP_PEPPER ?? "";
  return crypto.createHmac("sha256", pepper).update(code).digest("hex");
}

/**
 * Kullanıcı + amaç için yeni OTP üretir; önceki bekleyen kodları geçersiz kılar.
 * Dönen `id` değeri /dogrulama akışında ticket olarak kullanılır.
 */
export async function createOtp(
  userId: string,
  purpose: OtpPurpose
): Promise<{ id: string; code: string }> {
  const code = generateOtpCode();
  await prisma.otpCode.deleteMany({
    where: { user_id: userId, purpose, consumed_at: null },
  });
  const record = await prisma.otpCode.create({
    data: {
      user_id: userId,
      purpose,
      code_hash: hashOtp(code),
      expires_at: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return { id: record.id, code };
}

export type OtpVerifyResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/** Kodu doğrular; başarılıysa consumed_at işaretlenir. */
export async function verifyOtp(
  otpId: string,
  purpose: OtpPurpose,
  code: string
): Promise<OtpVerifyResult> {
  const record = await prisma.otpCode.findUnique({ where: { id: otpId } });
  if (!record || record.purpose !== purpose) {
    return { ok: false, error: "Doğrulama isteği bulunamadı. Yeniden giriş yapın." };
  }
  if (record.consumed_at) {
    return { ok: false, error: "Bu kod zaten kullanılmış. Yeniden giriş yapın." };
  }
  if (record.expires_at < new Date()) {
    return { ok: false, error: "Kodun süresi doldu. Yeniden kod isteyin." };
  }
  if (record.attempt_count >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Çok fazla hatalı deneme yapıldı. Yeniden giriş yapın." };
  }

  const match = crypto.timingSafeEqual(
    Buffer.from(record.code_hash, "hex"),
    Buffer.from(hashOtp(code), "hex")
  );
  if (!match) {
    const updated = await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempt_count: { increment: 1 } },
    });
    const remaining = OTP_MAX_ATTEMPTS - updated.attempt_count;
    return {
      ok: false,
      error:
        remaining > 0
          ? `Kod hatalı. Kalan deneme hakkı: ${remaining}`
          : "Çok fazla hatalı deneme yapıldı. Yeniden giriş yapın.",
    };
  }

  await prisma.otpCode.update({
    where: { id: record.id },
    data: { consumed_at: new Date() },
  });
  return { ok: true, userId: record.user_id };
}

/**
 * Giriş ticket'ını kullanıcıya dönüştürür (tek kullanımlık).
 * verifyOtp ile doğrulanmış (consumed) ve 60 sn içinde olan kayıt geçerlidir;
 * kayıt silinerek yeniden kullanılması engellenir.
 */
export async function consumeLoginTicket(ticket: string): Promise<User | null> {
  const record = await prisma.otpCode.findUnique({
    where: { id: ticket },
    include: { user: true },
  });
  if (!record || record.purpose !== "login" || !record.consumed_at) return null;
  if (Date.now() - record.consumed_at.getTime() > TICKET_EXCHANGE_WINDOW_MS) {
    return null;
  }
  await prisma.otpCode.delete({ where: { id: record.id } });
  return record.user;
}
