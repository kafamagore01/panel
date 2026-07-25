import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildPgConfig } from "./pg-config";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg(buildPgConfig(process.env.DATABASE_URL ?? ""), {
    onPoolError: (error) => console.error("Postgres havuz hatası:", error.message),
    onConnectionError: (error) => console.error("Postgres bağlantı hatası:", error.message),
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

/**
 * Singleton production'da da global'e yazılır: sunucusuz ortamda aynı örnek
 * içinde modül birden fazla kez değerlendirilebilir (ayrı sunucu chunk'ları) ve
 * her değerlendirme yeni bir bağlantı havuzu açarsa pooler'ın istemci sınırı dolar.
 */
globalForPrisma.prisma = prisma;
