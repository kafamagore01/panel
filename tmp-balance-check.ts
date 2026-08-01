import "dotenv/config";
import pg from "pg";
import { buildPgConfig } from "./src/lib/db/pg-config";
import { sumInBaseCurrency } from "./src/lib/currency";
import { getExchangeRates } from "./src/lib/exchange-rate";

async function main() {
  const client = new pg.Client(buildPgConfig(process.env.DATABASE_URL ?? "") as never);
  await client.connect();

  const { rows } = await client.query(
    `select currency, manual_fx_rate, sum(balance_due) as balance
       from invoices
      where status in ('issued','partial','overdue')
      group by currency, manual_fx_rate`
  );
  await client.end();

  console.log("Gruplar:", rows);

  const rates = await getExchangeRates();
  console.log("Kur anlik:", rates ? JSON.stringify(rates).slice(0, 120) : null);

  const naive = rows.reduce((acc, r) => acc + Number(r.balance), 0);
  const correct = sumInBaseCurrency(
    rows.map((r) => ({
      amount: Number(r.balance),
      currency: r.currency,
      manualRate: r.manual_fx_rate === null ? null : Number(r.manual_fx_rate),
    })),
    rates
  );

  console.log("ESKI (tek _sum, dovizi TL sayar):", naive);
  console.log("YENI (sumInBaseCurrency):", correct);
}

main().catch((error) => {
  console.error("HATA ->", error.message);
  process.exit(1);
});
