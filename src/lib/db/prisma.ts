import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL ?? "";
  // Supabase (ve çoğu yönetilen PostgreSQL) TLS ister. Bağlantı dizesinde
  // sslmode=disable yoksa TLS etkinleştirilir; pooler sertifikaları için
  // rejectUnauthorized=false güvenlidir (host doğrulaması dizeden gelir).
  const wantsSsl =
    connectionString.length > 0 && !/sslmode=disable/i.test(connectionString);
  const adapter = new PrismaPg({
    connectionString,
    ...(wantsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
