/** Finans hesaplama yardımcıları. */

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIsoDateUtc(value: string): number | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

/** İki takvim tarihi arasındaki vade gününü saat dilimi ve yaz saati etkisinden bağımsız hesaplar. */
export function calculateDueDays(issuedOn: string, paymentOn: string): number | null {
  const issuedAt = parseIsoDateUtc(issuedOn);
  const paymentAt = parseIsoDateUtc(paymentOn);
  if (issuedAt === null || paymentAt === null) return null;

  return (paymentAt - issuedAt) / MILLISECONDS_PER_DAY;
}

export function computeInvoiceTotals(subtotal: number, taxRate: number) {
  const tax_total = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + tax_total) * 100) / 100;
  return { subtotal, tax_total, total };
}

/** Müşteri bilgilerini fatura anına dondurmak için snapshot üretir. */
export function buildCustomerSnapshot(customer: {
  legal_name: string;
  trade_name: string | null;
  tax_number: string | null;
  tax_office: string | null;
  billing_address: string | null;
  email: string | null;
}) {
  return {
    legal_name: customer.legal_name,
    trade_name: customer.trade_name,
    tax_number: customer.tax_number,
    tax_office: customer.tax_office,
    billing_address: customer.billing_address,
    email: customer.email,
    snapshot_at: new Date().toISOString(),
  };
}

export function addInterval(date: Date, unit: "month" | "year", count: number): Date {
  const d = new Date(date);
  if (unit === "month") d.setMonth(d.getMonth() + count);
  else d.setFullYear(d.getFullYear() + count);
  return d;
}
