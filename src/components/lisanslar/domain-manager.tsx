"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Loader2, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { FormDrawer } from "@/components/form-drawer";
import {
  addLicenseDomain,
  removeLicenseDomain,
  setLicenseDomainStatus,
} from "@/actions/licenses";
import { useRouter } from "next/navigation";

export type DomainItem = {
  id: string;
  domain: string;
  normalized_domain: string;
  environment: string;
  is_primary: boolean;
  status: string;
};

export function DomainManager({
  open,
  onOpenChange,
  licenseId,
  domains,
  canCreate,
  canUpdate,
  canDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  licenseId: string;
  domains: DomainItem[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [isPending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const res = await addLicenseDomain({ license_id: licenseId, domain, environment });
      if (res.success) {
        toast.success(res.message ?? "Eklendi.");
        setDomain("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove(domainId: string) {
    startTransition(async () => {
      const res = await removeLicenseDomain(licenseId, domainId);
      if (res.success) {
        toast.success(res.message ?? "Kaldırıldı.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function toggleStatus(domainId: string, current: string) {
    startTransition(async () => {
      const res = await setLicenseDomainStatus({
        license_id: licenseId,
        domain_id: domainId,
        status: current === "active" ? "inactive" : "active",
      });
      if (res.success) {
        toast.success(res.message ?? "Güncellendi.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Domain Yönetimi"
      description="Lisansın geçerli olacağı domainleri tanımlayın."
    >
      <div className="space-y-4 pt-4">
        {canCreate && <div className="flex gap-2">
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="ornek.com"
            className="flex-1"
          />
          <Select value={environment} onValueChange={setEnvironment}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="production">Canlı</SelectItem>
              <SelectItem value="staging">Hazırlık</SelectItem>
              <SelectItem value="local">Yerel</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={add} disabled={isPending || !domain} className="bg-[#5267ff] hover:bg-[#4254e1]">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>}

        <div className="space-y-2">
          {domains.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Henüz domain eklenmedi.</p>
          ) : (
            domains.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                <div>
                  <p
                    className={`font-mono text-sm font-semibold ${
                      d.status === "active" ? "" : "text-slate-400 line-through"
                    }`}
                  >
                    {d.normalized_domain}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={d.environment} />
                    {d.status !== "active" && <StatusBadge status={d.status} />}
                    {d.is_primary && <span className="text-xs text-[#5267ff]">Birincil</span>}
                  </div>
                </div>
                <div className="flex items-center">
                  {canUpdate && <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleStatus(d.id, d.status)}
                    disabled={isPending}
                    title={d.status === "active" ? "Pasife al" : "Etkinleştir"}
                    className={d.status === "active" ? "text-slate-500" : "text-emerald-600"}
                  >
                    {d.status === "active" ? (
                      <PowerOff className="h-4 w-4" />
                    ) : (
                      <Power className="h-4 w-4" />
                    )}
                  </Button>}
                  {canDelete && <Button variant="ghost" size="icon" onClick={() => remove(d.id)} disabled={isPending} className="text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </FormDrawer>
  );
}
