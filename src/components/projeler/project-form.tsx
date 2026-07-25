"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { useRouter } from "next/navigation";
import { createProject, updateProject } from "@/actions/projects";
import { PROJECT_STATUS_OPTIONS } from "@/lib/validation/project";

export type Option = { id: string; label: string };
export type ProductOption = Option & {
  name: string;
  repository_url: string | null;
};

export type ProjectFormValues = {
  id?: string;
  customer_id: string;
  product_id: string;
  owner_user_id: string;
  name: string;
  branch_name: string;
  description: string;
  status: string;
  start_date: string;
  target_end_date: string;
  budget: string;
  currency: string;
  live_url: string;
  admin_url: string;
  repository_url: string;
  tech_stack: string;
  notes: string;
  license_webhook_url: string;
  license_webhook_secret: string;
};

const EMPTY: ProjectFormValues = {
  customer_id: "",
  product_id: "",
  owner_user_id: "",
  name: "",
  branch_name: "",
  description: "",
  status: "draft",
  start_date: "",
  target_end_date: "",
  budget: "",
  currency: "TRY",
  live_url: "",
  admin_url: "",
  repository_url: "",
  tech_stack: "",
  notes: "",
  license_webhook_url: "",
  license_webhook_secret: "",
};

export function ProjectForm({
  initial,
  customers,
  products,
  members,
  branchBases,
  onDone,
}: {
  initial?: Partial<ProjectFormValues>;
  customers: Option[];
  products: ProductOption[];
  members: Option[];
  branchBases: Option[];
  onDone: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const [values, setValues] = useState<ProjectFormValues>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [sellToBranch, setSellToBranch] = useState(false);
  const [baseProjectId, setBaseProjectId] = useState("");
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /** Katalogdan ürün seçilince form alanlarını otomatik doldur. */
  function onProductChange(productId: string) {
    set("product_id", productId);
    const product = products.find((p) => p.id === productId);
    if (product) {
      setValues((prev) => ({
        ...prev,
        product_id: productId,
        name: prev.name || product.name,
        repository_url: prev.repository_url || product.repository_url || "",
      }));
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const payload = {
      ...values,
      product_id: values.product_id || "",
      owner_user_id: values.owner_user_id || "",
      sell_to_branch: sellToBranch,
      base_project_id: sellToBranch ? baseProjectId : "",
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateProject(initial!.id!, payload)
        : await createProject(payload);
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
      <div className="grid grid-cols-2 gap-4">
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
        <Field label="Ürün (Katalog)" error={errors.product_id} hint="Seçince form otomatik doldurulur.">
          <Select value={values.product_id || "none"} onValueChange={(v) => onProductChange(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Ürün seçin" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Seçilmedi —</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Proje Adı" error={errors.name} required>
        <Input value={values.name} onChange={(e) => set("name", e.target.value)} required />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Branch Adı" error={errors.branch_name}>
          <Input value={values.branch_name} onChange={(e) => set("branch_name", e.target.value)} placeholder="main" />
        </Field>
        <Field label="Durum" error={errors.status}>
          <Select value={values.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROJECT_STATUS_OPTIONS.filter((o) => o.value !== "archived").map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {!isEdit && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#141821]">Başka Branch&apos;e Sat</p>
              <p className="text-xs text-muted-foreground">
                Var olan bir projenin yeni branch sürümü olarak kodlanır (PRJ-001-02).
              </p>
            </div>
            <Switch checked={sellToBranch} onCheckedChange={setSellToBranch} />
          </div>
          {sellToBranch && (
            <div className="mt-3">
              <Select value={baseProjectId} onValueChange={setBaseProjectId}>
                <SelectTrigger><SelectValue placeholder="Baz proje seçin" /></SelectTrigger>
                <SelectContent>
                  {branchBases.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Sorumlu" error={errors.owner_user_id}>
          <Select value={values.owner_user_id || "none"} onValueChange={(v) => set("owner_user_id", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Sorumlu seçin" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Seçilmedi —</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Bütçe" error={errors.budget}>
          <div className="flex gap-2">
            <Input type="number" step="0.01" value={values.budget} onChange={(e) => set("budget", e.target.value)} className="flex-1" />
            <Input value={values.currency} onChange={(e) => set("currency", e.target.value)} className="w-20" />
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Başlangıç" error={errors.start_date}>
          <Input type="date" value={values.start_date} onChange={(e) => set("start_date", e.target.value)} />
        </Field>
        <Field label="Hedef Bitiş" error={errors.target_end_date}>
          <Input type="date" value={values.target_end_date} onChange={(e) => set("target_end_date", e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Canlı URL" error={errors.live_url}>
          <Input value={values.live_url} onChange={(e) => set("live_url", e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Yönetim URL" error={errors.admin_url}>
          <Input value={values.admin_url} onChange={(e) => set("admin_url", e.target.value)} placeholder="https://" />
        </Field>
      </div>

      <Field label="Repo URL" error={errors.repository_url}>
        <Input value={values.repository_url} onChange={(e) => set("repository_url", e.target.value)} />
      </Field>

      <Field label="Teknoloji Yığını" error={errors.tech_stack} hint="Virgülle ayırın: Next.js, PostgreSQL, Redis">
        <Input value={values.tech_stack} onChange={(e) => set("tech_stack", e.target.value)} />
      </Field>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
        <p className="text-sm font-semibold text-[#141821]">Lisans Webhook (Opsiyonel)</p>
        <Field label="Webhook URL (HTTPS)" error={errors.license_webhook_url}>
          <Input value={values.license_webhook_url} onChange={(e) => set("license_webhook_url", e.target.value)} placeholder="https://musteri.com/webhook" />
        </Field>
        <Field label="Webhook Secret (min 16 karakter)" error={errors.license_webhook_secret}>
          <Input value={values.license_webhook_secret} onChange={(e) => set("license_webhook_secret", e.target.value)} placeholder={isEdit ? "Değiştirmek için yenisini girin" : ""} />
        </Field>
      </div>

      <Field label="Notlar" error={errors.notes}>
        <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>Vazgeç</Button>
        <Button type="submit" disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? "Güncelle" : "Oluştur"}
        </Button>
      </div>
    </form>
  );
}
