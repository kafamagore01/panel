const MONEY_SCALE = 100;

function toCents(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

export type PaymentState =
  | { ok: false; balance: number }
  | {
      ok: true;
      paidTotal: number;
      balanceDue: number;
      status: "partial" | "paid";
    };

export function calculatePaymentState(
  total: number,
  paidTotal: number,
  amount: number
): PaymentState {
  const totalCents = toCents(total);
  const paidCents = toCents(paidTotal);
  const amountCents = toCents(amount);
  const balanceCents = totalCents - paidCents;

  if (
    !Number.isSafeInteger(totalCents) ||
    !Number.isSafeInteger(paidCents) ||
    !Number.isSafeInteger(amountCents) ||
    totalCents < 0 ||
    paidCents < 0 ||
    amountCents <= 0 ||
    amountCents > balanceCents
  ) {
    return { ok: false, balance: Math.max(0, balanceCents) / MONEY_SCALE };
  }

  const nextPaidCents = paidCents + amountCents;
  const nextBalanceCents = totalCents - nextPaidCents;
  return {
    ok: true,
    paidTotal: nextPaidCents / MONEY_SCALE,
    balanceDue: nextBalanceCents / MONEY_SCALE,
    status: nextBalanceCents === 0 ? "paid" : "partial",
  };
}
