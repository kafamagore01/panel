import crypto from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { PanelAdapter } from "./adapter";
import { consumeLoginTicket } from "./otp";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 gün

/**
 * Auth.js v5 — Credentials + database session (JWT yok).
 *
 * Credentials provider normalde JWT oturuma zorlar; jwt.encode override'ı ile
 * giriş anında sessions tablosuna kayıt atılır ve cookie değeri olarak ham
 * sessionToken döndürülür. Sonraki isteklerde strategy "database" olduğu için
 * cookie değeri adapter.getSessionAndUser ile veritabanından doğrulanır.
 *
 * İki giriş yolu vardır (orkestrasyon src/actions/auth.ts içindedir):
 *  1. email + password  → yalnızca 2FA kapalı kullanıcılar
 *  2. ticket            → 2FA OTP doğrulaması tamamlanmış kullanıcılar
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PanelAdapter(),
  session: { strategy: "database", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/giris" },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        ticket: {},
      },
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

        // 2FA açık kullanıcı parola yoluyla oturum açamaz; OTP akışı zorunlu
        if (user.two_factor_enabled_at) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  jwt: {
    async encode({ token }) {
      const userId = token?.sub;
      if (!userId) throw new Error("Oturum oluşturulamadı.");
      const sessionToken = crypto.randomUUID();
      await prisma.session.create({
        data: {
          session_token: sessionToken,
          user_id: userId,
          expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
        },
      });
      return sessionToken;
    },
    async decode() {
      // Cookie değeri JWT değil sessionToken'dır; çözümleme yapılmaz.
      return null;
    },
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
