import assert from "node:assert/strict";
import test from "node:test";
import { nextInvoiceNumber } from "./invoice-number";

test("advisory lock sonucunu Prisma'nın desteklediği text tipine dönüştürür", async () => {
  const queries: string[] = [];
  const tx = {
    async $queryRaw(strings: TemplateStringsArray) {
      const query = strings.join("?");
      queries.push(query);

      return queries.length === 1 ? [{ locked: "" }] : [{ sequence: 7 }];
    },
  } as unknown as Parameters<typeof nextInvoiceNumber>[0];

  const invoiceNo = await nextInvoiceNumber(
    tx,
    "00000000-0000-0000-0000-000000000000",
    2026
  );

  assert.match(
    queries[0],
    /pg_advisory_xact_lock\([\s\S]*\)::text AS locked/
  );
  assert.equal(invoiceNo, "FT-2026-0008");
});
