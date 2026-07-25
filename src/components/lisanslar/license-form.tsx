"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/form-field";
import { createLicense } from "@/actions/licenses";
import type { Option } from "@/components/projeler/project-form";
import { useRouter } from "next/navigation";

export function LicenseForm({
  projects,
  onCreated,
  onCancel,
}: {
  projects: Array<Option & { product_name: string }>;
  onCreated: (licenseKey: string) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState("");
  const [productName, setProductName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [graceDays, setGraceDays] = useState("14");
  const [activationLimit, setActivationLimit] = useState("1");
  const [autoSuspend, setAutoSuspend] = useState(false);
  const [features, setFeatures] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function onProjectChange(id: string) {
    setProjectId(id);
    const project = projects.find((p) => p.id === id);
    if (project && !productName) setProductName(project.product_name);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await createLicense({
        project_id: projectId,
        product_name: productName,
        starts_at: startsAt,
        expires_at: expiresAt,
        grace_days: graceDays,
        activation_limit: activationLimit,
        auto_suspend: autoSuspend,
        features,
      });
      if (res.success) {
        toast.success(res.message ?? "Lisans üretildi.");
        onCreated(res.data.licenseKey);
        router.refresh();
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-4">
      <Field label="Proje" error={errors.project_id} required>
        <Select value={projectId} onValueChange={onProjectChange}>
          <SelectTrigger><SelectValue placeholder="Proje seçin" /></SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Ürün Adı" error={errors.product_name} required>
        <Input value={productName} onChange={(e) => setProductName(e.target.value)} required />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Başlangıç" error={errors.starts_at}>
          <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label="Bitiş" error={errors.expires_at}>
          <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Ek Süre (gün)" error={errors.grace_days}>
          <Input type="number" min="0" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} />
        </Field>
        <Field label="Aktivasyon Limiti" error={errors.activation_limit} required>
          <Input type="number" min="1" value={activationLimit} onChange={(e) => setActivationLimit(e.target.value)} required />
        </Field>
      </div>

      <Field label="Özellikler" error={errors.features} hint="Virgülle ayırın: api_access, multi_user">
        <Input value={features} onChange={(e) => setFeatures(e.target.value)} />
      </Field>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div>
          <p className="text-sm font-semibold text-[#141821]">Otomatik Askıya Alma</p>
          <p className="text-xs text-muted-foreground">Süre dolduğunda lisans otomatik askıya alınır.</p>
        </div>
        <Switch checked={autoSuspend} onCheckedChange={setAutoSuspend} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>Vazgeç</Button>
        <Button type="submit" disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Lisans Üret
        </Button>
      </div>
    </form>
  );
}
