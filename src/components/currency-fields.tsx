"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/form-field";
import {
  CURRENCY_OPTIONS,
  getRate,
  isForeignCurrency,
  type ExchangeRates,
} from "@/lib/currency";
import { formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Para birimi seçici — tetikleyicide yalnızca kod, listede tam ad görünür. */
export function CurrencySelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full [&_[data-currency-name]]:hidden", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CURRENCY_OPTIONS.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            <span className="font-medium">{c.code}</span>
            <span data-currency-name="" className="text-muted-foreground">{c.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Dövizli tutarlarda kur girdisi; TRY seçiliyken gizlidir.
 *
 * Boş bırakılırsa TCMB'nin o günkü kuru kullanılır ve TL karşılığı her gün
 * kendiliğinden güncellenir. Bir değer yazılırsa o kur kayda sabitlenir —
 * TCMB'de yayımlanmayan para birimlerinde tek yol budur.
 */
export function ExchangeRateField({
  currency,
  value,
  onChange,
  rates,
  error,
}: {
  currency: string;
  value: string;
  onChange: (value: string) => void;
  rates: ExchangeRates | null;
  error?: string[];
}) {
  if (!isForeignCurrency(currency)) return null;

  const official = getRate(currency, rates);
  const isManual = value.trim() !== "";

  return (
    <Field label={`Kur — 1 ${currency} kaç ₺`} error={error} required={official === null}>
      <div className="flex gap-2">
        <Input
          type="number"
          step="0.0001"
          min="0"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={official !== null ? official.toFixed(4) : "Örn. 12.8500"}
          className="flex-1"
        />
        {official !== null && (
          <button
            type="button"
            onClick={() => onChange(isManual ? "" : official.toFixed(4))}
            className="shrink-0 rounded-md border border-input px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {isManual ? "Otomatiğe dön" : "TCMB kurunu yaz"}
          </button>
        )}
      </div>

      {official !== null ? (
        isManual ? (
          <p className="text-xs text-muted-foreground">
            Bu kur kayda sabitlenir. Güncel TCMB kuru: {formatRate(official)} ₺
            {rates?.date ? ` · ${rates.date}` : ""}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            TCMB günlük kuru kullanılıyor: {formatRate(official)} ₺
            {rates?.date ? ` · ${rates.date}` : ""} — her gün kendiliğinden güncellenir.
          </p>
        )
      ) : (
        <p className="text-xs text-amber-600">
          Bu para birimi TCMB bülteninde yayımlanmıyor; kuru elle girin.
        </p>
      )}
    </Field>
  );
}
