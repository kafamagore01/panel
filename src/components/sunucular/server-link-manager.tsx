"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDrawer } from "@/components/form-drawer";
import { linkProjectServer, unlinkProjectServer } from "@/actions/servers";
import type { Option } from "@/components/projeler/project-form";
import { useRouter } from "next/navigation";

export type ServerLink = {
  project_id: string;
  project_label: string;
  role: string | null;
  environment: string | null;
};

export function ServerLinkManager({
  open,
  onOpenChange,
  serverId,
  links,
  projects,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  serverId: string;
  links: ServerLink[];
  projects: Option[];
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState("");
  const [role, setRole] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [isPending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const res = await linkProjectServer({
        server_id: serverId,
        project_id: projectId,
        role,
        environment,
      });
      if (res.success) {
        toast.success(res.message ?? "Eklendi.");
        setProjectId("");
        setRole("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove(pid: string) {
    startTransition(async () => {
      const res = await unlinkProjectServer(serverId, pid);
      if (res.success) {
        toast.success(res.message ?? "Kaldırıldı.");
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
      title="Proje Eşleştirmeleri"
      description="Bu sunucuda barındırılan projeleri yönetin."
    >
      <div className="space-y-4 pt-4">
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger><SelectValue placeholder="Proje seçin" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Rol (web, db...)" className="flex-1" />
            <Select value={environment} onValueChange={setEnvironment}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Canlı</SelectItem>
                <SelectItem value="staging">Hazırlık</SelectItem>
                <SelectItem value="local">Yerel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={isPending || !projectId} className="w-full bg-[#5267ff] hover:bg-[#4254e1]">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Eşleştir
          </Button>
        </div>

        <div className="space-y-2">
          {links.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Henüz proje eşleştirilmedi.</p>
          ) : (
            links.map((l) => (
              <div key={l.project_id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                <div>
                  <p className="text-sm font-semibold text-[#141821]">{l.project_label}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.role ?? "—"} · {l.environment ?? "—"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(l.project_id)} disabled={isPending} className="text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </FormDrawer>
  );
}
