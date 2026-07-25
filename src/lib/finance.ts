/** Finans hesaplama yardımcıları. */

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
