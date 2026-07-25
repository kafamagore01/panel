import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString =
  process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
const wantsSsl = connectionString.length > 0 && !/sslmode=disable/i.test(connectionString);
const adapter = new PrismaPg({
  connectionString,
  ...(wantsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});
const prisma = new PrismaClient({ adapter });

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@panel.local";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "Owner123!";

async function main() {
  const password_hash = await bcrypt.hash(OWNER_PASSWORD, 12);

  const workspace = await prisma.workspace.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Operasyon Merkezi",
      timezone: "Europe/Istanbul",
      default_currency: "TRY",
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: {
      name: "Sistem Sahibi",
      email: OWNER_EMAIL,
      password_hash,
      email_verified_at: new Date(),
      current_workspace_id: workspace.id,
    },
  });

  await prisma.workspaceUser.upsert({
    where: {
      workspace_id_user_id: { workspace_id: workspace.id, user_id: owner.id },
    },
    update: {},
    create: {
      workspace_id: workspace.id,
      user_id: owner.id,
      role: "owner",
      status: "active",
    },
  });

  console.log("Seed tamamlandı:");
  console.log(`  Workspace : ${workspace.name} (${workspace.id})`);
  console.log(`  Owner     : ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  console.log("  Giriş sonrası parolayı mutlaka değiştirin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
