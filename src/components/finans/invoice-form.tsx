"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { createInvoice, updateInvoice } from "@/actions/finance";
import { formatMoney, formatRate } from "@/lib/format";
import { calculateDueDays } from "@/lib/finance";
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

export type InvoiceProjectOption = Option & {
  budget: number | null;
  currency: string;
  customer_id: string;
};

export type InvoiceFormInitialData = {
  id: string;
  customer_id: string;
  project_id: string | null;
  description: string | null;
  subtotal: number;
  tax_rate: number;
  currency: string;
  manual_fx_rate: number | null;
  issued_on: string;
  payment_on: string;
  notes: string | null;
};

function getLocalToday() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return localTime.toISOString().slice(0, 10);
}

function getInitialValues(invoice?: InvoiceFormInitialData) {
  if (invoice) {
    const dueDays = calculateDueDays(invoice.issued_on, invoice.payment_on);
    return {
      customer_id: invoice.customer_id,
      project_id: invoice.project_id ?? "",
      description: invoice.description ?? "",
      subtotal: String(invoice.subtotal),
      tax_rate: String(invoice.tax_rate),
      currency: invoice.currency,
      manual_fx_rate:
        invoice.manual_fx_rate === null ? "" : String(invoice.manual_fx_rate),
      issued_on: invoice.issued_on,
      payment_on: invoice.payment_on,
      due_days: dueDays === null ? "" : String(dueDays),
      notes: invoice.notes ?? "",
    };
  }

  const today = getLocalToday();
  return {
    customer_id: "",
    project_id: "",
    description: "",
    subtotal: "",
    tax_rate: "20",
    currency: "TRY",
    manual_fx_rate: "",
    issued_on: today,
    payment_on: today,
    due_days: "0",
    notes: "",
  };
}

export function InvoiceForm({
  customers,
  projects,
  rates,
  invoice,
  onDone,
}: {
  customers: Option[];
  projects: InvoiceProjectOption[];
  /** TCMB günlük kur bülteni; alınamadıysa null. */
  rates: ExchangeRates | null;
  invoice?: InvoiceFormInitialData;
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState(() => getInitialValues(invoice));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function set(key: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /** Para birimi değişince önceki birime ait elle girilmiş kur düşer. */
  function setCurrency(code: string) {
    setValues((prev) => ({ ...prev, currency: code, manual_fx_rate: "" }));
  }

  function setCustomer(customerId: string) {
    setValues((prev) => {
      const selectedProject = projects.find(
        (project) => project.id === prev.project_id
      );
      return {
        ...prev,
        customer_id: customerId,
        project_id:
          selectedProject && selectedProject.customer_id !== customerId
            ? ""
            : prev.project_id,
      };
    });
  }

  function setIssuedOn(issuedOn: string) {
    setValues((prev) => {
      if (!issuedOn) return { ...prev, issued_on: "", due_days: "" };

      const dueDays = calculateDueDays(issuedOn, prev.payment_on);
      if (dueDays === null || dueDays < 0) {
        return {
          ...prev,
          issued_on: issuedOn,
          payment_on: issuedOn,
          due_days: "0",
        };
      }

      return { ...prev, issued_on: issuedOn, due_days: String(dueDays) };
    });
  }

  function setPaymentOn(paymentOn: string) {
    setValues((prev) => {
      const dueDays = calculateDueDays(prev.issued_on, paymentOn);
      return {
        ...prev,
        payment_on: paymentOn,
        due_days: dueDays !== null && dueDays >= 0 ? String(dueDays) : "",
      };
    });
  }

  function onProjectChange(value: string) {
    const projectId = value === "none" ? "" : value;
    const project = projects.find((option) => option.id === projectId);

    setValues((prev) => ({
      ...prev,
      project_id: projectId,
      ...(project ? { customer_id: project.customer_id } : {}),
      ...(project?.budget != null && project.budget > 0
        ? {
            subtotal: String(project.budget),
            currency: project.currency,
            manual_fx_rate: "",
          }
        : {}),
    }));
  }

  // Elle kur girilmişse o, girilmemişse günlük TCMB kuru
  const fx = resolveRate(values.currency, Number(values.manual_fx_rate) || null, rates);

  const preview = useMemo(() => {
    const sub = Number(values.subtotal) || 0;
    const rate = Number(values.tax_rate) || 0;
    const tax = Math.round(sub * (rate / 100) * 100) / 100;
    const total = sub + tax;
    return { tax, total, baseTotal: convertWithRate(total, fx?.value ?? null) };
  }, [values.subtotal, values.tax_rate, fx?.value]);

  const foreign = isForeignCurrency(values.currency);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = invoice
        ? await updateInvoice(invoice.id, values)
        : await createInvoice(values);
      if (res.success) {
        toast.success(
          res.message ?? (invoice ? "Fatura güncellendi." : "Fatura oluşturuldu.")
        );
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
        <Select value={values.customer_id} onValueChange={setCustomer}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Müşteri seçin" /></SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Proje (opsiyonel)" error={errors.project_id}>
        <Select value={values.project_id || "none"} onValueChange={onProjectChange}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Proje seçin" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Seçilmedi —</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Açıklama" error={errors.description}>
        <Input value={values.description} onChange={(e) => set("description", e.target.value)} placeholder="Hizmet açıklaması" />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Ara Toplam" error={errors.subtotal} required>
          <Input type="number" step="0.01" value={values.subtotal} onChange={(e) => set("subtotal", e.target.value)} required />
        </Field>
        <Field label="KDV (%)" error={errors.tax_rate}>
          <Input type="number" step="0.01" value={values.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} />
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

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">KDV Tutarı</span><span className="font-semibold">{formatMoney(preview.tax, values.currency)}</span></div>
        <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Genel Toplam</span><span className="font-extrabold text-[#141821]">{formatMoney(preview.total, values.currency)}</span></div>

        {foreign && (
          <div className="mt-2 border-t border-slate-200 pt-2">
            {fx && preview.baseTotal !== null ? (
              <>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{fx.source === "manual" ? "Elle girilen kur" : `TCMB günlük kuru${rates?.date ? ` · ${rates.date}` : ""}`}</span>
                  <span className="tabular-nums">1 {values.currency} = {formatRate(fx.value)} ₺</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">TL Karşılığı</span>
                  <span className="font-bold tabular-nums text-[#141821]">≈ {formatMoney(preview.baseTotal, BASE_CURRENCY)}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-amber-600">
                TL karşılığı için yukarıdan kur girin.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Düzenleme Tarihi" error={errors.issued_on} required>
          <Input type="date" value={values.issued_on} onChange={(e) => setIssuedOn(e.target.value)} required />
        </Field>
        <Field label="Ödeme Tarihi" error={errors.payment_on} required>
          <Input
            type="date"
            min={values.issued_on}
            value={values.payment_on}
            onChange={(e) => setPaymentOn(e.target.value)}
            required
          />
        </Field>
        <Field label="Vade (gün)">
          <Input
            type="number"
            value={values.due_days}
            readOnly
            aria-readonly="true"
            className="cursor-not-allowed bg-slate-100 text-slate-600"
          />
        </Field>
      </div>

      <Field label="Notlar" error={errors.notes}>
        <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>Vazgeç</Button>
        <Button type="submit" disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {invoice ? "Değişiklikleri Kaydet" : "Fatura Oluştur"}
        </Button>
      </div>
    </form>
  );
}
