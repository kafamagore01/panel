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
import { RepoPicker } from "@/components/projeler/repo-picker";
import { RepoStatusPanel } from "@/components/projeler/repo-status";
import type { RepoOption } from "@/lib/github/repos";
import { createProject, updateProject } from "@/actions/projects";
import { PROJECT_STATUS_OPTIONS } from "@/lib/validation/project";
import {
  BASE_CURRENCY,
  convertWithRate,
  isForeignCurrency,
  resolveRate,
  type ExchangeRates,
} from "@/lib/currency";
import { CurrencySelect, ExchangeRateField } from "@/components/currency-fields";
import { formatMoney, formatRate } from "@/lib/format";

export type Option = { id: string; label: string };
export type ProductOption = Option & {
  name: string;
  repository_url: string | null;
};

export type ProjectFormValues = {
  id?: string;
  customer_id: string;
  source_project_id: string;
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
  manual_fx_rate: string;
  live_url: string;
  admin_url: string;
  repository_url: string;
  github_repo_id: string;
  github_repo_full_name: string;
  tech_stack: string;
  notes: string;
  license_webhook_url: string;
  license_webhook_secret: string;
};

export type SourceProjectOption = Option & {
  product_id: string;
  owner_user_id: string;
  name: string;
  branch_name: string;
  description: string;
  repository_url: string;
  github_repo_id: string;
  github_repo_full_name: string;
  tech_stack: string;
};

const EMPTY: ProjectFormValues = {
  customer_id: "",
  source_project_id: "",
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
  manual_fx_rate: "",
  live_url: "",
  admin_url: "",
  repository_url: "",
  github_repo_id: "",
  github_repo_full_name: "",
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
  sourceProjects,
  rates,
  onDone,
}: {
  initial?: Partial<ProjectFormValues>;
  customers: Option[];
  products: ProductOption[];
  members: Option[];
  sourceProjects: SourceProjectOption[];
  /** TCMB günlük kur bülteni; alınamadıysa null. */
  rates: ExchangeRates | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const [values, setValues] = useState<ProjectFormValues>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [reuseExistingProject, setReuseExistingProject] = useState(false);
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedSourceProject = sourceProjects.find(
    (project) => project.id === sourceProjectId
  );
  const hasInheritedGithubRepo = Boolean(
    selectedSourceProject?.github_repo_id ||
      selectedSourceProject?.github_repo_full_name
  );

  function set<K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /** Para birimi değişince önceki birime ait elle girilmiş kur düşer. */
  function setCurrency(code: string) {
    setValues((prev) => ({ ...prev, currency: code, manual_fx_rate: "" }));
  }

  /** Dövizli bütçelerde TL karşılığı — elle kur girilmemişse günlük TCMB kuru. */
  const fx = resolveRate(values.currency, Number(values.manual_fx_rate) || null, rates);
  const budgetAmount = Number(values.budget);
  const budgetInBase =
    isForeignCurrency(values.currency) && budgetAmount > 0
      ? convertWithRate(budgetAmount, fx?.value ?? null)
      : null;

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

  /** Kaynak proje seçilince müşteriye özel alanlar hariç yeniden kullanılabilir bilgiler dolar. */
  function onSourceProjectChange(projectId: string) {
    setSourceProjectId(projectId);
    const source = sourceProjects.find((project) => project.id === projectId);
    if (!source) return;

    setValues((prev) => ({
      ...prev,
      source_project_id: source.id,
      product_id: source.product_id,
      owner_user_id: source.owner_user_id,
      name: source.name,
      branch_name: source.branch_name,
      description: source.description,
      repository_url: source.repository_url,
      github_repo_id: source.github_repo_id,
      github_repo_full_name: source.github_repo_full_name,
      tech_stack: source.tech_stack,
    }));
  }

  function onReuseExistingProjectChange(checked: boolean) {
    setReuseExistingProject(checked);
    if (!checked) {
      setSourceProjectId("");
      setValues((prev) => ({ ...prev, source_project_id: "" }));
    }
  }

  /**
   * Repo seçilince bağlı alanlar doldurulur. Repo URL her zaman güncellenir
   * (bağlantının kaynağı odur); ad, branch, açıklama ve dil yalnızca boşsa
   * yazılır — kullanıcının girdiği değerler ezilmez.
   */
  function onRepoSelect(repo: RepoOption) {
    setValues((prev) => ({
      ...prev,
      github_repo_id: repo.id,
      github_repo_full_name: repo.full_name,
      repository_url: repo.html_url,
      name: prev.name || repo.name,
      branch_name: prev.branch_name || repo.default_branch,
      description: prev.description || (repo.description ?? ""),
      tech_stack: prev.tech_stack || (repo.language ?? ""),
    }));
  }

  /** Yalnızca GitHub eşleşmesini kaldırır; serbest metin Repo URL korunur. */
  function onRepoClear() {
    setValues((prev) => ({
      ...prev,
      github_repo_id: "",
      github_repo_full_name: "",
    }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const payload = {
      ...values,
      product_id: values.product_id || "",
      owner_user_id: values.owner_user_id || "",
      reuse_existing_project: reuseExistingProject,
      source_project_id: reuseExistingProject ? sourceProjectId : "",
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
          <Select
            value={values.product_id || "none"}
            onValueChange={(v) => onProductChange(v === "none" ? "" : v)}
            disabled={Boolean(selectedSourceProject?.product_id)}
          >
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

      {!isEdit && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#141821]">
                Mevcut Projeyi Başka Müşteriye Sat
              </p>
              <p className="text-xs text-muted-foreground">
                Aynı ürün ve repo üzerinden yeni bir müşteri veya şube kaydı oluşturur.
              </p>
            </div>
            <Switch
              checked={reuseExistingProject}
              onCheckedChange={onReuseExistingProjectChange}
            />
          </div>
          {reuseExistingProject && (
            <div className="mt-3 space-y-2">
              <Select value={sourceProjectId} onValueChange={onSourceProjectChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Satılacak kaynak projeyi seçin" />
                </SelectTrigger>
                <SelectContent>
                  {sourceProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.source_project_id && (
                <p className="text-xs text-rose-600">{errors.source_project_id[0]}</p>
              )}
              {sourceProjectId && (
                <p className="text-xs text-muted-foreground">
                  Ürün, repo, branch, açıklama ve teknoloji bilgileri kaynak projeden
                  getirildi. Müşteri, bütçe, tarihler ve yayın adresleri bu satışa özeldir.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <Field label="Proje Adı" error={errors.name} required>
        <Input value={values.name} onChange={(e) => set("name", e.target.value)} required />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Repo Branch'i" error={errors.branch_name}>
          <Input
            value={values.branch_name}
            onChange={(e) => set("branch_name", e.target.value)}
            placeholder="main"
            readOnly={Boolean(selectedSourceProject?.branch_name)}
          />
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
            <CurrencySelect value={values.currency} onChange={setCurrency} className="w-24" />
          </div>
          {budgetInBase !== null && fx && (
            <p className="text-xs text-muted-foreground">
              ≈ {formatMoney(budgetInBase, BASE_CURRENCY)} · 1 {values.currency} ={" "}
              {formatRate(fx.value)} ₺
              {fx.source === "manual" ? " (elle girilen kur)" : rates?.date ? ` · TCMB ${rates.date}` : ""}
            </p>
          )}
        </Field>
      </div>

      <ExchangeRateField
        currency={values.currency}
        value={values.manual_fx_rate}
        onChange={(v) => set("manual_fx_rate", v)}
        rates={rates}
        error={errors.manual_fx_rate}
      />

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

      <div className="space-y-3 rounded-xl border border-slate-200 p-3">
        <div>
          <p className="text-sm font-semibold text-[#141821]">GitHub Reposu</p>
          <p className="text-xs text-muted-foreground">
            Bağlanan repo canlı takip edilir: varsayılan dal, son commit ve açık
            issue sayısı GitHub&apos;dan anlık okunur.
          </p>
        </div>

        {hasInheritedGithubRepo ? (
          <div className="rounded-lg border border-[#5267ff]/20 bg-[#5267ff]/5 px-3 py-2">
            <p className="text-sm font-medium text-[#141821]">
              {values.github_repo_full_name}
            </p>
            <p className="text-xs text-muted-foreground">
              Bu repo kaynak projeden bağlıdır.
            </p>
          </div>
        ) : (
          <RepoPicker
            value={values.github_repo_full_name}
            onSelect={onRepoSelect}
            onClear={onRepoClear}
          />
        )}

        {values.github_repo_full_name && (
          <RepoStatusPanel
            key={values.github_repo_full_name}
            fullName={values.github_repo_full_name}
          />
        )}
      </div>

      <Field
        label="Repo URL"
        error={errors.repository_url}
        hint="GitHub'dan repo seçtiğinizde otomatik dolar; farklı bir adres de yazabilirsiniz."
      >
        <Input
          value={values.repository_url}
          onChange={(e) => set("repository_url", e.target.value)}
          readOnly={Boolean(selectedSourceProject?.repository_url)}
        />
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
