import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { OtpPurpose, User } from "@/generated/prisma/client";
import { requireEnvironmentVariable } from "@/lib/env";

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
  const pepper = requireEnvironmentVariable("APP_PEPPER");
  if (pepper.length < 32) {
    throw new Error("APP_PEPPER en az 32 karakter olmalıdır.");
  }
  return crypto.createHmac("sha256", pepper).update(code).digest("hex");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
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
  const codeHash = hashOtp(code);
  const record = await prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM users
      WHERE id = ${userId}::uuid
      FOR UPDATE
    `;
    if (users.length === 0) throw new Error("OTP kullanıcısı bulunamadı.");
    await tx.otpCode.deleteMany({
      where: { user_id: userId, purpose, consumed_at: null },
    });
    return tx.otpCode.create({
      data: {
        user_id: userId,
        purpose,
        code_hash: codeHash,
        expires_at: new Date(Date.now() + OTP_TTL_MS),
      },
    });
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
  if (!isUuid(otpId)) {
    return {
      ok: false,
      error: "Doğrulama isteği bulunamadı. Yeniden giriş yapın.",
    };
  }
  const attemptedHash = hashOtp(code);
  return prisma.$transaction(async (tx): Promise<OtpVerifyResult> => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM otp_codes
      WHERE id = ${otpId}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0) {
      return {
        ok: false,
        error: "Doğrulama isteği bulunamadı. Yeniden giriş yapın.",
      };
    }

    const record = await tx.otpCode.findUnique({ where: { id: otpId } });
    if (!record || record.purpose !== purpose) {
      return {
        ok: false,
        error: "Doğrulama isteği bulunamadı. Yeniden giriş yapın.",
      };
    }
    if (record.consumed_at) {
      return {
        ok: false,
        error: "Bu kod zaten kullanılmış. Yeniden giriş yapın.",
      };
    }
    if (record.expires_at < new Date()) {
      return {
        ok: false,
        error: "Kodun süresi doldu. Yeniden kod isteyin.",
      };
    }
    if (record.attempt_count >= OTP_MAX_ATTEMPTS) {
      return {
        ok: false,
        error: "Çok fazla hatalı deneme yapıldı. Yeniden giriş yapın.",
      };
    }

    const expected = Buffer.from(record.code_hash, "hex");
    const attempted = Buffer.from(attemptedHash, "hex");
    const match =
      expected.length === attempted.length &&
      crypto.timingSafeEqual(expected, attempted);
    if (!match) {
      const updated = await tx.otpCode.update({
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

    await tx.otpCode.update({
      where: { id: record.id },
      data: { consumed_at: new Date() },
    });
    return { ok: true, userId: record.user_id };
  });
}

/**
 * Giriş ticket'ını kullanıcıya dönüştürür (tek kullanımlık).
 * verifyOtp ile doğrulanmış (consumed) ve 60 sn içinde olan kayıt geçerlidir;
 * kayıt silinerek yeniden kullanılması engellenir.
 */
export async function consumeLoginTicket(ticket: string): Promise<User | null> {
  if (!isUuid(ticket)) return null;
  const consumedAfter = new Date(Date.now() - TICKET_EXCHANGE_WINDOW_MS);
  const rows = await prisma.$queryRaw<Array<{ user_id: string }>>`
    DELETE FROM otp_codes
    WHERE id = ${ticket}::uuid
      AND purpose = 'login'
      AND consumed_at IS NOT NULL
      AND consumed_at >= ${consumedAfter}
    RETURNING user_id
  `;
  if (rows.length !== 1) return null;
  return prisma.user.findUnique({ where: { id: rows[0].user_id } });
}
