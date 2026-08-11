"use client";

import { useMemo, useState, useTransition } from "react";
import { LockKeyhole, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resetRolePermissions, updateRolePermissions } from "@/actions/roles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PERMISSION_MODULES,
  DEFAULT_ROLE_PERMISSIONS,
  type BuiltinRole,
  type PermissionAction,
  type PermissionOperation,
} from "@/lib/auth/permission-catalog";
import { cn } from "@/lib/utils";

export type RolePermissionProfile = {
  role: BuiltinRole;
  label: string;
  locked: boolean;
  permissions: PermissionAction[];
};

const OPERATION_LABELS: Record<PermissionOperation, string> = {
  view: "Görüntüle",
  create: "Oluştur",
  update: "Düzenle",
  delete: "Sil",
};

export function RolePermissionsView({
  profiles,
}: {
  profiles: RolePermissionProfile[];
}) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<BuiltinRole>("technical");
  const [drafts, setDrafts] = useState<Record<BuiltinRole, PermissionAction[]>>(() =>
    Object.fromEntries(
      profiles.map((profile) => [profile.role, profile.permissions])
    ) as Record<BuiltinRole, PermissionAction[]>
  );
  const [isPending, startTransition] = useTransition();
  const selected = useMemo(
    () => profiles.find((profile) => profile.role === selectedRole) ?? profiles[0],
    [profiles, selectedRole]
  );
  const permissions = drafts[selectedRole] ?? selected?.permissions ?? [];

  function togglePermission(action: PermissionAction, checked: boolean) {
    const [moduleKey, operation] = action.split(".") as [string, PermissionOperation];
    setDrafts((currentDrafts) => {
      const current = currentDrafts[selectedRole] ?? [];
      const next = new Set(current);
      if (checked) {
        next.add(action);
        if (operation !== "view") {
          next.add(`${moduleKey}.view` as PermissionAction);
        }
      } else {
        next.delete(action);
        if (operation === "view") {
          for (const permission of next) {
            if (permission.startsWith(`${moduleKey}.`)) next.delete(permission);
          }
        }
      }
      return { ...currentDrafts, [selectedRole]: [...next] };
    });
  }

  function save() {
    if (!selected || selected.locked) return;
    startTransition(async () => {
      const result = await updateRolePermissions(selected.role, permissions);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function reset() {
    if (!selected || selected.locked) return;
    startTransition(async () => {
      const result = await resetRolePermissions(selected.role);
      if (result.success) {
        toast.success(result.message);
        setDrafts((current) => ({
          ...current,
          [selected.role]: [...DEFAULT_ROLE_PERMISSIONS[selected.role]],
        }));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="h-fit rounded-[18px] border border-slate-200/80 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2 px-3 py-2 text-sm font-extrabold text-[#141821]">
          <ShieldCheck className="h-4 w-4 text-[#5267ff]" />
          Roller
        </div>
        <div className="space-y-1">
          {profiles.map((profile) => (
            <button
              key={profile.role}
              type="button"
              onClick={() => setSelectedRole(profile.role)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                selectedRole === profile.role
                  ? "bg-[#5267ff]/10 text-[#4054e8]"
                  : "text-slate-700 hover:bg-slate-50"
              )}
            >
              <span>{profile.label}</span>
              {profile.locked && <LockKeyhole className="h-3.5 w-3.5 text-slate-400" />}
            </button>
          ))}
        </div>
      </aside>

      <section className="overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-[#141821]">{selected?.label}</h2>
              {selected?.locked && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  Sabit rol
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {selected?.locked
                ? "Sahip ve Yönetici tam yetkilidir; güvenlik için izinleri değiştirilemez."
                : "İzinler yalnızca bu çalışma alanındaki kullanıcıları etkiler."}
            </p>
          </div>
          {!selected?.locked && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} disabled={isPending}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Varsayılan
              </Button>
              <Button onClick={save} disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
                <Save className="mr-1.5 h-4 w-4" />
                Kaydet
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Modül</th>
                {Object.values(OPERATION_LABELS).map((label) => (
                  <th key={label} className="w-24 px-3 py-3 text-center">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MODULES.map((module) => (
                <tr key={module.key} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-[#141821]">{module.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{module.description}</p>
                  </td>
                  {Object.keys(OPERATION_LABELS).map((operation) => {
                    const typedOperation = operation as PermissionOperation;
                    const available = (module.operations as readonly string[]).includes(operation);
                    const action = `${module.key}.${operation}` as PermissionAction;
                    return (
                      <td key={operation} className="px-3 py-4 text-center">
                        {available ? (
                          <Checkbox
                            aria-label={`${module.label} ${OPERATION_LABELS[typedOperation]}`}
                            checked={permissions.includes(action)}
                            disabled={Boolean(selected?.locked) || isPending}
                            onCheckedChange={(checked) =>
                              togglePermission(action, checked === true)
                            }
                            className="mx-auto"
                          />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
