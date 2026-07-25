import type { Adapter, AdapterUser } from "next-auth/adapters";
import { prisma } from "@/lib/db/prisma";
import type { User } from "@/generated/prisma/client";

function toAdapterUser(user: User): AdapterUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified_at,
    name: user.name,
  };
}

/**
 * Snake_case şemamıza uyarlanmış minimal Auth.js adapter'ı.
 * Yalnızca database session yönetimi için gereken metotları uygular;
 * kullanıcı oluşturma davet akışıyla (Server Action) yapılır.
 */
export function PanelAdapter(): Adapter {
  return {
    async createUser() {
      throw new Error("Kullanıcı kaydı yalnızca davet akışıyla yapılabilir.");
    },
    async getUser(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? toAdapterUser(user) : null;
    },
    async getUserByEmail(email) {
      const user = await prisma.user.findUnique({ where: { email } });
      return user ? toAdapterUser(user) : null;
    },
    async getUserByAccount() {
      return null;
    },
    async updateUser(user) {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { email_verified_at: user.emailVerified ?? undefined },
      });
      return toAdapterUser(updated);
    },
    async createSession({ sessionToken, userId, expires }) {
      await prisma.session.create({
        data: { session_token: sessionToken, user_id: userId, expires },
      });
      return { sessionToken, userId, expires };
    },
    async getSessionAndUser(sessionToken) {
      const session = await prisma.session.findUnique({
        where: { session_token: sessionToken },
        include: { user: true },
      });
      if (!session) return null;
      return {
        session: {
          sessionToken: session.session_token,
          userId: session.user_id,
          expires: session.expires,
        },
        user: toAdapterUser(session.user),
      };
    },
    async updateSession({ sessionToken, expires }) {
      try {
        const session = await prisma.session.update({
          where: { session_token: sessionToken },
          data: { expires: expires ?? undefined },
        });
        return {
          sessionToken: session.session_token,
          userId: session.user_id,
          expires: session.expires,
        };
      } catch {
        return null;
      }
    },
    async deleteSession(sessionToken) {
      try {
        await prisma.session.delete({
          where: { session_token: sessionToken },
        });
      } catch {
        // oturum zaten silinmiş olabilir
      }
    },
  };
}
