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
import { createInvoice } from "@/actions/finance";
import { formatMoney } from "@/lib/format";
import type { Option } from "@/components/projeler/project-form";
import { useRouter } from "next/navigation";

export function InvoiceForm({
  customers,
  projects,
  onDone,
}: {
  customers: Option[];
  projects: Option[];
  onDone: () => void;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [values, setValues] = useState({
    customer_id: "",
    project_id: "",
    description: "",
    subtotal: "",
    tax_rate: "20",
    currency: "TRY",
    issued_on: today,
    due_days: "7",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function set(key: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const preview = useMemo(() => {
    const sub = Number(values.subtotal) || 0;
    const rate = Number(values.tax_rate) || 0;
    const tax = Math.round(sub * (rate / 100) * 100) / 100;
    return { tax, total: sub + tax };
  }, [values.subtotal, values.tax_rate]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await createInvoice(values);
      if (res.success) {
        toast.success(res.message ?? "Fatura oluşturuldu.");
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
          <SelectTrigger><SelectValue placeholder="Müşteri seçin" /></SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Proje (opsiyonel)" error={errors.project_id}>
        <Select value={values.project_id || "none"} onValueChange={(v) => set("project_id", v === "none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Proje seçin" /></SelectTrigger>
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
          <Input value={values.currency} onChange={(e) => set("currency", e.target.value)} />
        </Field>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">KDV Tutarı</span><span className="font-semibold">{formatMoney(preview.tax, values.currency)}</span></div>
        <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Genel Toplam</span><span className="font-extrabold text-[#141821]">{formatMoney(preview.total, values.currency)}</span></div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Düzenleme Tarihi" error={errors.issued_on} required>
          <Input type="date" value={values.issued_on} onChange={(e) => set("issued_on", e.target.value)} required />
        </Field>
        <Field label="Vade (gün)" error={errors.due_days}>
          <Input type="number" value={values.due_days} onChange={(e) => set("due_days", e.target.value)} />
        </Field>
      </div>

      <Field label="Notlar" error={errors.notes}>
        <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>Vazgeç</Button>
        <Button type="submit" disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Fatura Oluştur
        </Button>
      </div>
    </form>
  );
}
