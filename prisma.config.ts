import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!migrationUrl) {
  throw new Error("Prisma için DIRECT_URL veya DATABASE_URL tanımlı olmalıdır.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    // Migration/seed komutları için DOĞRUDAN/session bağlantısı kullanılır
    // (Supabase transaction pooler'ı DDL ve advisory lock desteklemez).
    // Runtime bağlantısı src/lib/db/prisma.ts içindeki PrismaPg adapter'ından gelir.
    url: migrationUrl,
  },
});
