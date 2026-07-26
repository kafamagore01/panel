import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildPgConfig } from "./pg-config";
import { assertEnvironment } from "@/lib/env";
import { logError } from "@/lib/logger";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  if (process.env.NODE_ENV === "production") {
    assertEnvironment(process.env, true);
  }
  const adapter = new PrismaPg(buildPgConfig(process.env.DATABASE_URL ?? ""), {
    onPoolError: (error) => logError("postgres.pool_error", error),
    onConnectionError: (error) =>
      logError("postgres.connection_error", error),
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
