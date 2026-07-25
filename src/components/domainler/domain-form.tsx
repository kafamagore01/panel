"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { createDomain, updateDomain } from "@/actions/domains";
import { DOMAIN_STATUS_OPTIONS } from "@/lib/validation/domain";
import type { Option } from "@/components/projeler/project-form";

export type DomainFormValues = {
  id?: string;
  name: string;
  registrar: string;
  registrar_url: string;
  customer_id: string;
  project_id: string;
  status: string;
  registered_at: string;
  expires_at: string;
  ssl_expires_at: string;
  auto_renew: boolean;
  nameservers: string;
  annual_cost: string;
  currency: string;
  notes: string;
};

/** Radix Select boş değer kabul etmediği için "yok" seçimi bu sabitle taşınır. */
const NONE = "none";

const EMPTY: DomainFormValues = {
  name: "", registrar: "", registrar_url: "", customer_id: NONE, project_id: NONE,
  status: "active", registered_at: "", expires_at: "", ssl_expires_at: "",
  auto_renew: true, nameservers: "", annual_cost: "", currency: "TRY", notes: "",
};

export function DomainForm({
  initial,
  customers,
  projects,
  onDone,
}: {
  initial?: Partial<DomainFormValues>;
  customers: Option[];
  projects: Option[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<DomainFormValues>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof DomainFormValues>(key: K, value: DomainFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = initial?.id
        ? await updateDomain(initial.id, values)
        : await createDomain(values);
      if (res.success) {
        toast.success(res.message ?? "Kaydedildi.");
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
      <Field label="Alan Adı" error={errors.name} required hint="ornek.com · https:// ve yol bilgisi otomatik temizlenir">
        <Input
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="ornek.com"
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Kayıt Firması" error={errors.registrar}>
          <Input
            value={values.registrar}
            onChange={(e) => set("registrar", e.target.value)}
            placeholder="Natro, Cloudflare, GoDaddy..."
          />
        </Field>
        <Field label="Durum" error={errors.status}>
          <Select value={values.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOMAIN_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Yönetim Paneli URL" error={errors.registrar_url}>
        <Input
          value={values.registrar_url}
          onChange={(e) => set("registrar_url", e.target.value)}
          placeholder="https://panel.natro.com"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Müşteri" error={errors.customer_id}>
          <Select value={values.customer_id} onValueChange={(v) => set("customer_id", v)}>
            <SelectTrigger><SelectValue placeholder="Seçilmedi" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Seçilmedi</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Proje" error={errors.project_id}>
          <Select value={values.project_id} onValueChange={(v) => set("project_id", v)}>
            <SelectTrigger><SelectValue placeholder="Seçilmedi" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Seçilmedi</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Kayıt Tarihi" error={errors.registered_at}>
          <Input type="date" value={values.registered_at} onChange={(e) => set("registered_at", e.target.value)} />
        </Field>
        <Field label="Bitiş Tarihi" error={errors.expires_at}>
          <Input type="date" value={values.expires_at} onChange={(e) => set("expires_at", e.target.value)} />
        </Field>
        <Field label="SSL Bitişi" error={errors.ssl_expires_at}>
          <Input type="date" value={values.ssl_expires_at} onChange={(e) => set("ssl_expires_at", e.target.value)} />
        </Field>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-[#141821]">Otomatik Yenileme</p>
          <p className="text-xs text-muted-foreground">
            Kayıt firmasında otomatik yenileme açıksa işaretleyin.
          </p>
        </div>
        <Switch checked={values.auto_renew} onCheckedChange={(v) => set("auto_renew", v)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Yıllık Maliyet" error={errors.annual_cost}>
          <Input type="number" step="0.01" value={values.annual_cost} onChange={(e) => set("annual_cost", e.target.value)} />
        </Field>
        <Field label="Para Birimi" error={errors.currency}>
          <Input value={values.currency} onChange={(e) => set("currency", e.target.value)} />
        </Field>
      </div>

      <Field label="Nameserver'lar" error={errors.nameservers} hint="Virgülle ayırın">
        <Textarea
          value={values.nameservers}
          onChange={(e) => set("nameservers", e.target.value)}
          placeholder="ns1.ornek.com, ns2.ornek.com"
          rows={2}
        />
      </Field>

      <Field label="Notlar" error={errors.notes}>
        <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>Vazgeç</Button>
        <Button type="submit" disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initial?.id ? "Güncelle" : "Ekle"}
        </Button>
      </div>
    </form>
  );
}
