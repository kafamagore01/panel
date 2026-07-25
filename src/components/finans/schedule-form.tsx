"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { createSchedule } from "@/actions/finance";
import { formatMoney, formatRate } from "@/lib/format";
import {
  BASE_CURRENCY,
  convertWithRate,
  isForeignCurrency,
  resolveRate,
  type ExchangeRates,
} from "@/lib/currency";
import { CurrencySelect, ExchangeRateField } from "@/components/currency-fields";
import type { Option } from "@/components/projeler/project-form";
import { useRouter } from "next/navigation";

export function ScheduleForm({
  customers,
  projects,
  rates,
  onDone,
}: {
  customers: Option[];
  projects: Option[];
  /** TCMB günlük kur bülteni; alınamadıysa null. */
  rates: ExchangeRates | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [values, setValues] = useState({
    customer_id: "",
    project_id: "",
    title: "",
    amount: "",
    tax_rate: "20",
    currency: "TRY",
    manual_fx_rate: "",
    interval_unit: "month",
    interval_count: "1",
    starts_on: today,
    ends_on: "",
    due_days: "7",
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function set(key: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /** Para birimi değişince önceki birime ait elle girilmiş kur düşer. */
  function setCurrency(code: string) {
    setValues((prev) => ({ ...prev, currency: code, manual_fx_rate: "" }));
  }

  // Elle kur girilmişse o, girilmemişse günlük TCMB kuru
  const fx = resolveRate(values.currency, Number(values.manual_fx_rate) || null, rates);

  /** Periyot başına KDV dahil tutar ve dövizli planlarda TL karşılığı. */
  const preview = useMemo(() => {
    const amount = Number(values.amount) || 0;
    const rate = Number(values.tax_rate) || 0;
    const total = Math.round(amount * (1 + rate / 100) * 100) / 100;
    return { total, baseTotal: convertWithRate(total, fx?.value ?? null) };
  }, [values.amount, values.tax_rate, fx?.value]);

  const foreign = isForeignCurrency(values.currency);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await createSchedule(values);
      if (res.success) {
        toast.success(res.message ?? "Plan oluşturuldu.");
        onDone();
        router.refresh();
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-4">
      <Field label="Müşteri" error={errors.customer_id} required>
        <Select value={values.customer_id} onValueChange={(v) => set("customer_id", v)}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Müşteri seçin" /></SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Proje (opsiyonel)" error={errors.project_id}>
        <Select value={values.project_id || "none"} onValueChange={(v) => set("project_id", v === "none" ? "" : v)}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Proje seçin" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Seçilmedi —</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Başlık" error={errors.title} required>
        <Input value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="Aylık bakım ücreti" required />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Tutar" error={errors.amount} required>
          <Input type="number" step="0.01" value={values.amount} onChange={(e) => set("amount", e.target.value)} required />
        </Field>
        <Field label="KDV (%)" error={errors.tax_rate}>
          <Input type="number" value={values.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} />
        </Field>
        <Field label="Para Birimi" error={errors.currency}>
          <CurrencySelect value={values.currency} onChange={setCurrency} />
        </Field>
      </div>

      <ExchangeRateField
        currency={values.currency}
        value={values.manual_fx_rate}
        onChange={(v) => set("manual_fx_rate", v)}
        rates={rates}
        error={errors.manual_fx_rate}
      />

      {foreign && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Periyot Tutarı (KDV dahil)</span>
            <span className="font-semibold tabular-nums">{formatMoney(preview.total, values.currency)}</span>
          </div>
          {fx && preview.baseTotal !== null ? (
            <>
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-xs text-muted-foreground">
                <span>{fx.source === "manual" ? "Elle girilen kur" : `TCMB günlük kuru${rates?.date ? ` · ${rates.date}` : ""}`}</span>
                <span className="tabular-nums">1 {values.currency} = {formatRate(fx.value)} ₺</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">TL Karşılığı</span>
                <span className="font-bold tabular-nums text-[#141821]">≈ {formatMoney(preview.baseTotal, BASE_CURRENCY)}</span>
              </div>
            </>
          ) : (
            <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-amber-600">
              TL karşılığı için yukarıdan kur girin.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Periyot" error={errors.interval_unit}>
          <Select value={values.interval_unit} onValueChange={(v) => set("interval_unit", v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Aylık</SelectItem>
              <SelectItem value="year">Yıllık</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Aralık (kaç periyotta bir)" error={errors.interval_count}>
          <Input type="number" min="1" value={values.interval_count} onChange={(e) => set("interval_count", e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Başlangıç" error={errors.starts_on} required>
          <Input type="date" value={values.starts_on} onChange={(e) => set("starts_on", e.target.value)} required />
        </Field>
        <Field label="Bitiş (opsiyonel)" error={errors.ends_on}>
          <Input type="date" value={values.ends_on} onChange={(e) => set("ends_on", e.target.value)} />
        </Field>
        <Field label="Vade (gün)" error={errors.due_days}>
          <Input type="number" value={values.due_days} onChange={(e) => set("due_days", e.target.value)} />
        </Field>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>Vazgeç</Button>
        <Button type="submit" disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Plan Oluştur
        </Button>
      </div>
    </form>
  );
}
