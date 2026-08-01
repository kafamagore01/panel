import assert from "node:assert/strict";
import test from "node:test";
import { sumInBaseCurrency, type ExchangeRates } from "./currency";

const rates: ExchangeRates = {
  date: "01.08.2026",
  rates: { TRY: 1, USD: 43, EUR: 50 },
};

test("TL ve dolar bakiyelerini doların TL karşılığını kullanarak toplar", () => {
  assert.equal(
    sumInBaseCurrency(
      [
        { amount: 45_000, currency: "TRY" },
        { amount: 500, currency: "USD" },
      ],
      rates
    ),
    66_500
  );
});

test("faturaya kaydedilmiş manuel kuru TCMB kuruna tercih eder", () => {
  assert.equal(
    sumInBaseCurrency(
      [{ amount: 500, currency: "USD", manualRate: 40 }],
      rates
    ),
    20_000
  );
});

test("döviz kuru bulunamazsa kısmi ve hatalı toplam üretmez", () => {
  assert.equal(
    sumInBaseCurrency(
      [
        { amount: 1_000, currency: "TRY" },
        { amount: 100, currency: "USD" },
      ],
      null
    ),
    null
  );
});

test("dönüşümleri kuruş hassasiyetinde toplar", () => {
  assert.equal(
    sumInBaseCurrency(
      [
        { amount: 0.1, currency: "USD" },
        { amount: 0.2, currency: "USD" },
      ],
      { date: "01.08.2026", rates: { TRY: 1, USD: 3 } }
    ),
    0.9
  );
});
