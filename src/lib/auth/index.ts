import crypto from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { consumeLoginTicket } from "./otp";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 gün

function expiryDate(): Date {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
}

/**
 * Auth.js v5 — Credentials + veritabanı oturumu (çerezde JWT yok).
 *
 * Not: @auth/core, "yalnızca credentials" + strategy:"database" kombinasyonunu
 * reddeder (assert.js). Bu yüzden strategy "jwt" seçilir; ancak jwt.encode/decode
 * override'ı ile çerez değeri bir JWT değil, sessions tablosundaki opak bir
 * session_token olur. Böylece oturumlar tümüyle veritabanında tutulur/doğrulanır.
 *
 * İki giriş yolu (orkestrasyon src/actions/auth.ts):
 *  1. email + password  → yalnızca 2FA kapalı kullanıcılar
 *  2. ticket            → 2FA OTP doğrulaması tamamlanmış kullanıcılar
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/giris" },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, ticket: {} },
      async authorize(credentials) {
        const ticket =
          typeof credentials?.ticket === "string" ? credentials.ticket : null;
        if (ticket) {
          const user = await consumeLoginTicket(ticket);
          return user ? { id: user.id, email: user.email, name: user.name } : null;
        }

        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : null;
        const password =
          typeof credentials?.password === "string" ? credentials.password : null;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        // 2FA açık kullanıcı parola yoluyla giremez; OTP akışı zorunlu
        if (user.two_factor_enabled_at) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  jwt: {
    // Çerez değerini üretir: DB'de session_token oluşturur/uzatır ve onu döndürür.
    async encode({ token }): Promise<string> {
      if (!token?.sub) return "";
      const existing = (token as JWT & { sessionToken?: string }).sessionToken;
      if (typeof existing === "string" && existing.length > 0) {
        await prisma.session.updateMany({
          where: { session_token: existing },
          data: { expires: expiryDate() },
        });
        return existing;
      }
      const sessionToken = crypto.randomUUID();
      await prisma.session.create({
        data: {
          session_token: sessionToken,
          user_id: token.sub,
          expires: expiryDate(),
        },
      });
      return sessionToken;
    },
    // Çerez değeri (opak session_token) → DB'den doğrulanır.
    async decode({ token }): Promise<JWT | null> {
      if (!token || typeof token !== "string") return null;
      const session = await prisma.session.findUnique({
        where: { session_token: token },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      if (!session || session.expires < new Date()) return null;
      return {
        sub: session.user.id,
        name: session.user.name,
        email: session.user.email,
        sessionToken: token,
      } as JWT;
    },
  },
  callbacks: {
    async session({ session, token }) {
      if (token?.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
  events: {
    // Çıkışta ilgili DB oturumunu sil (opak token üzerinden).
    async signOut(message) {
      const token =
        "token" in message
          ? (message.token as (JWT & { sessionToken?: string }) | null)
          : null;
      const sessionToken = token?.sessionToken;
      if (typeof sessionToken === "string" && sessionToken.length > 0) {
        await prisma.session.deleteMany({ where: { session_token: sessionToken } });
      }
    },
  },
});
