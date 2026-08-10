import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_DIR = join(process.cwd(), "src");
const LOCK_FN = "pg_advisory_xact_lock";

function collectSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "generated" || entry === "node_modules") continue;
      found.push(...collectSourceFiles(full));
      continue;
    }
    // Test dosyaları taramanın dışında: kalıbı örnek olarak içerirler.
    if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
    if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
    found.push(full);
  }
  return found;
}

/**
 * pg_advisory_xact_lock() void döner ve Prisma void kolonunu deserialize
 * edemez ($queryRaw → P2010). Kilit çağrısı bu yüzden daima desteklenen bir
 * tipe cast edilmelidir.
 */
test("advisory lock çağrıları desteklenen bir tipe cast edilir", () => {
  const offenders: string[] = [];

  for (const file of collectSourceFiles(SRC_DIR)) {
    const source = readFileSync(file, "utf8");
    if (!source.includes(LOCK_FN)) continue;

    // Kilit çağrısından sonraki kapanış parantezini takip eden ::<tip> aranır.
    // Örn: pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS locked
    const uncast = new RegExp(
      `${LOCK_FN}\\s*\\((?:[^()]|\\([^()]*\\))*\\)(?!\\s*::)`,
      "g"
    );
    if (uncast.test(source)) {
      offenders.push(file.replace(process.cwd(), "").replace(/\\/g, "/"));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Cast edilmemiş ${LOCK_FN} çağrısı bulundu (Prisma P2010 verir): ${offenders.join(", ")}`
  );
});
