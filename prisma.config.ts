import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    // Migration/seed komutları için bağlantı; runtime bağlantısı
    // src/lib/db/prisma.ts içindeki PrismaPg adapter'ından gelir.
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/panel_placeholder",
  },
});
