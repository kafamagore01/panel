import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildPgConfig } from "../src/lib/db/pg-config";
import bcrypt from "bcryptjs";

function requiredSeedValue(name: "SEED_OWNER_EMAIL" | "SEED_OWNER_PASSWORD") {
  const candidate = process.env[name]?.trim();
  if (!candidate) {
    throw new Error(`${name} seed çalıştırılmadan önce tanımlanmalıdır.`);
  }
  return candidate;
}

const OWNER_EMAIL = requiredSeedValue("SEED_OWNER_EMAIL").toLowerCase();
const OWNER_PASSWORD = requiredSeedValue("SEED_OWNER_PASSWORD");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(OWNER_EMAIL)) {
  throw new Error("SEED_OWNER_EMAIL geçerli bir e-posta adresi olmalıdır.");
}
if (
  OWNER_PASSWORD.length < 16 ||
  !/[a-z]/.test(OWNER_PASSWORD) ||
  !/[A-Z]/.test(OWNER_PASSWORD) ||
  !/\d/.test(OWNER_PASSWORD) ||
  !/[^A-Za-z0-9]/.test(OWNER_PASSWORD)
) {
  throw new Error(
    "SEED_OWNER_PASSWORD en az 16 karakter ve büyük/küçük harf, sayı, sembol içermelidir."
  );
}

const adapter = new PrismaPg(
  buildPgConfig(process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "")
);
const prisma = new PrismaClient({ adapter });

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
      force_password_reset: true,
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
  console.log(`  Owner     : ${OWNER_EMAIL}`);
  console.log("  Owner parolası loglanmadı; ilk girişte değiştirilmesi zorunludur.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
