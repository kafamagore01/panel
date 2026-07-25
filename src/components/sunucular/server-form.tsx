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
import { createServer, updateServer } from "@/actions/servers";
import { useRouter } from "next/navigation";

export type ServerFormValues = {
  id?: string;
  name: string;
  provider: string;
  external_ref: string;
  type: string;
  hostname: string;
  primary_ip: string;
  region: string;
  operating_system: string;
  cpu_cores: string;
  ram_mb: string;
  disk_gb: string;
  management_url: string;
  ssh_port: string;
  ssh_user: string;
  status: string;
  renewal_at: string;
  monthly_cost: string;
  currency: string;
};

const EMPTY: ServerFormValues = {
  name: "", provider: "", external_ref: "", type: "vps", hostname: "",
  primary_ip: "", region: "", operating_system: "", cpu_cores: "", ram_mb: "",
  disk_gb: "", management_url: "", ssh_port: "22", ssh_user: "", status: "active",
  renewal_at: "", monthly_cost: "", currency: "TRY",
};

export function ServerForm({
  initial,
  onDone,
}: {
  initial?: Partial<ServerFormValues>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ServerFormValues>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof ServerFormValues>(key: K, value: ServerFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = initial?.id
        ? await updateServer(initial.id, values)
        : await createServer(values);
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
        <Field label="Sunucu Adı" error={errors.name} required>
          <Input value={values.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Tür" error={errors.type}>
          <Select value={values.type} onValueChange={(v) => set("type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vds">VDS</SelectItem>
              <SelectItem value="vps">VPS</SelectItem>
              <SelectItem value="hosting">Hosting</SelectItem>
              <SelectItem value="dedicated">Dedicated</SelectItem>
              <SelectItem value="cloud">Cloud</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Sağlayıcı" error={errors.provider}>
          <Input value={values.provider} onChange={(e) => set("provider", e.target.value)} placeholder="Hetzner, DigitalOcean..." />
        </Field>
        <Field label="Durum" error={errors.status}>
          <Select value={values.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="maintenance">Bakım</SelectItem>
              <SelectItem value="suspended">Askıda</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Hostname" error={errors.hostname}>
          <Input value={values.hostname} onChange={(e) => set("hostname", e.target.value)} />
        </Field>
        <Field label="Ana IP" error={errors.primary_ip}>
          <Input value={values.primary_ip} onChange={(e) => set("primary_ip", e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Bölge" error={errors.region}>
          <Input value={values.region} onChange={(e) => set("region", e.target.value)} />
        </Field>
        <Field label="İşletim Sistemi" error={errors.operating_system}>
          <Input value={values.operating_system} onChange={(e) => set("operating_system", e.target.value)} placeholder="Ubuntu 24.04" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="CPU (çekirdek)" error={errors.cpu_cores}>
          <Input type="number" value={values.cpu_cores} onChange={(e) => set("cpu_cores", e.target.value)} />
        </Field>
        <Field label="RAM (MB)" error={errors.ram_mb}>
          <Input type="number" value={values.ram_mb} onChange={(e) => set("ram_mb", e.target.value)} />
        </Field>
        <Field label="Disk (GB)" error={errors.disk_gb}>
          <Input type="number" value={values.disk_gb} onChange={(e) => set("disk_gb", e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="SSH Portu" error={errors.ssh_port}>
          <Input type="number" value={values.ssh_port} onChange={(e) => set("ssh_port", e.target.value)} />
        </Field>
        <Field label="SSH Kullanıcı" error={errors.ssh_user}>
          <Input value={values.ssh_user} onChange={(e) => set("ssh_user", e.target.value)} />
        </Field>
      </div>

      <Field label="Yönetim URL" error={errors.management_url}>
        <Input value={values.management_url} onChange={(e) => set("management_url", e.target.value)} />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Yenileme Tarihi" error={errors.renewal_at}>
          <Input type="date" value={values.renewal_at} onChange={(e) => set("renewal_at", e.target.value)} />
        </Field>
        <Field label="Aylık Maliyet" error={errors.monthly_cost}>
          <Input type="number" step="0.01" value={values.monthly_cost} onChange={(e) => set("monthly_cost", e.target.value)} />
        </Field>
        <Field label="Para Birimi" error={errors.currency}>
          <Input value={values.currency} onChange={(e) => set("currency", e.target.value)} />
        </Field>
      </div>

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
