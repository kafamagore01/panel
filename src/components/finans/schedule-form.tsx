"use client";

import { useState, useTransition } from "react";
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
import type { Option } from "@/components/projeler/project-form";
import { useRouter } from "next/navigation";

export function ScheduleForm({
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
    title: "",
    amount: "",
    tax_rate: "20",
    currency: "TRY",
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
          <Input value={values.currency} onChange={(e) => set("currency", e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Periyot" error={errors.interval_unit}>
          <Select value={values.interval_unit} onValueChange={(v) => set("interval_unit", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
