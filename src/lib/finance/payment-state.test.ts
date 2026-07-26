import assert from "node:assert/strict";
import test from "node:test";
import { calculatePaymentState } from "./payment-state";

test("kısmi ödemede kuruş bazında tutarlı toplam üretir", () => {
  assert.deepEqual(calculatePaymentState(1_000, 200, 125.55), {
    ok: true,
    paidTotal: 325.55,
    balanceDue: 674.45,
    status: "partial",
  });
});

test("bakiyenin tamamı ödendiğinde faturayı paid yapar", () => {
  assert.deepEqual(calculatePaymentState(100, 75.5, 24.5), {
    ok: true,
    paidTotal: 100,
    balanceDue: 0,
    status: "paid",
  });
});

test("bakiyeyi aşan veya geçersiz ödemeyi reddeder", () => {
  assert.deepEqual(calculatePaymentState(100, 80, 20.01), {
    ok: false,
    balance: 20,
  });
  assert.deepEqual(calculatePaymentState(100, 0, 0), {
    ok: false,
    balance: 100,
  });
});

test("binary floating point değerlerini kuruşa yuvarlar", () => {
  assert.deepEqual(calculatePaymentState(0.3, 0.1, 0.2), {
    ok: true,
    paidTotal: 0.3,
    balanceDue: 0,
    status: "paid",
  });
});
