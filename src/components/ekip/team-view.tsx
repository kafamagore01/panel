"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus,
  UserPlus,
  MoreHorizontal,
  Loader2,
  Check,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/status-badge";
import { FormDrawer } from "@/components/form-drawer";
import { Field } from "@/components/form-field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  inviteMember,
  changeMemberRole,
  changeMemberStatus,
  removeMember,
  createWorkspace,
  deleteWorkspace,
  switchWorkspace,
} from "@/actions/team";
import { useRouter } from "next/navigation";
import { roleLabel } from "@/lib/roles";

export type WorkspaceItem = { id: string; name: string; role: string; active: boolean };
export type MemberItem = {
  membership_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  is_self: boolean;
};

export function TeamView({
  workspaces,
  currentWorkspaceId,
  members,
  assignableRoles,
  canViewWorkspaces,
  canCreateWorkspace,
  canDeleteWorkspace,
  canViewMembers,
  canCreateMember,
  canUpdateMember,
  canDeleteMember,
}: {
  workspaces: WorkspaceItem[];
  currentWorkspaceId: string;
  members: MemberItem[];
  assignableRoles: string[];
  canViewWorkspaces: boolean;
  canCreateWorkspace: boolean;
  canDeleteWorkspace: boolean;
  canViewMembers: boolean;
  canCreateMember: boolean;
  canUpdateMember: boolean;
  canDeleteMember: boolean;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [, startTransition] = useTransition();

  function onSwitch(id: string) {
    startTransition(async () => {
      const res = await switchWorkspace(id);
      if (res.success) {
        toast.success(res.message ?? "Değiştirildi.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function onRoleChange(membershipId: string, role: string) {
    startTransition(async () => {
      const res = await changeMemberRole(membershipId, role as MemberItem["role"] as never);
      if (res.success) {
        toast.success(res.message ?? "Güncellendi.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function onStatusChange(membershipId: string, active: boolean) {
    startTransition(async () => {
      const res = await changeMemberStatus(membershipId, active);
      if (res.success) {
        toast.success(res.message ?? "Güncellendi.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {canViewWorkspaces && <div className="rounded-[18px] border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-extrabold text-[#141821]">Çalışma Alanları</h2>
          {canCreateWorkspace && <Button variant="outline" size="sm" onClick={() => setWsOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Yeni Alan
          </Button>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className={`flex items-center justify-between rounded-[12px] border p-3 text-left transition-colors ${
                ws.id === currentWorkspaceId
                  ? "border-[#5267ff] bg-[#5267ff]/5"
                  : "border-slate-200 hover:border-[#5267ff]/40"
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => ws.id !== currentWorkspaceId && onSwitch(ws.id)}
              >
                <p className="text-sm font-semibold text-[#141821]">{ws.name}</p>
                <p className="text-xs text-muted-foreground">{roleLabel(ws.role)}</p>
              </button>
              <div className="ml-2 flex items-center gap-1">
                {ws.id === currentWorkspaceId && <Check className="h-4 w-4 text-[#5267ff]" />}
                {canDeleteWorkspace && ws.id === currentWorkspaceId && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    }
                    title="Çalışma alanını sil"
                    description={`${ws.name} çalışma alanı silinecek. Bu işlem alanı tüm kullanıcılar için kapatır.`}
                    confirmLabel="Alanı Sil"
                    destructive
                    action={() => deleteWorkspace(ws.id)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>}

      {canViewMembers && <div className="rounded-[18px] border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center justify-between p-5">
          <h2 className="font-extrabold text-[#141821]">Ekip Üyeleri</h2>
          {canCreateMember && (
            <Button onClick={() => setInviteOpen(true)} className="bg-[#5267ff] hover:bg-[#4254e1]">
              <UserPlus className="mr-1 h-4 w-4" />
              Üye Davet Et
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Üye</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.membership_id}>
                  <TableCell>
                    <div className="font-semibold text-[#141821]">
                      {m.name}
                      {m.is_self && <span className="ml-2 text-xs text-muted-foreground">(siz)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </TableCell>
                  <TableCell>
                    {canUpdateMember && assignableRoles.includes(m.role) ? (
                      <Select value={m.role} onValueChange={(v) => onRoleChange(m.membership_id, v)}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {assignableRoles.map((r) => (
                            <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">{roleLabel(m.role)}</span>
                    )}
                  </TableCell>
                  <TableCell><StatusBadge status={m.status} /></TableCell>
                  <TableCell>
                    {(canUpdateMember || canDeleteMember) && !m.is_self && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canUpdateMember && (m.status === "active" ? (
                            <DropdownMenuItem onClick={() => onStatusChange(m.membership_id, false)} className="text-rose-600">
                              Pasifleştir
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => onStatusChange(m.membership_id, true)}>
                              Aktifleştir
                            </DropdownMenuItem>
                          ))}
                          {canDeleteMember && (
                            <ConfirmDialog
                              trigger={
                                <DropdownMenuItem
                                  onSelect={(event) => event.preventDefault()}
                                  className="text-rose-600"
                                >
                                  Kullanıcıyı Sil
                                </DropdownMenuItem>
                              }
                              title="Kullanıcıyı çalışma alanından sil"
                              description={`${m.name} (${m.email}) bu çalışma alanından kalıcı olarak kaldırılacak.`}
                              confirmLabel="Kullanıcıyı Sil"
                              destructive
                              action={() => removeMember(m.membership_id)}
                            />
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>}

      {canCreateMember && <InviteDrawer open={inviteOpen} onOpenChange={setInviteOpen} assignableRoles={assignableRoles} />}
      {canCreateWorkspace && <WorkspaceDrawer open={wsOpen} onOpenChange={setWsOpen} />}
    </div>
  );
}

function InviteDrawer({
  open,
  onOpenChange,
  assignableRoles,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  assignableRoles: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(assignableRoles[0] ?? "viewer");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await inviteMember({ name, email, role });
      if (res.success) {
        toast.success(res.message ?? "Davet edildi.");
        setName("");
        setEmail("");
        onOpenChange(false);
        router.refresh();
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
      }
    });
  }

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Üye Davet Et" description="Yeni bir kullanıcıya e-posta ile davet gönderin.">
      <form onSubmit={submit} className="space-y-4 pt-4">
        <Field label="Ad Soyad" error={errors.name} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="E-posta" error={errors.email} required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Rol" error={errors.role}>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {assignableRoles.map((r) => (
                <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Vazgeç</Button>
          <Button type="submit" disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Davet Gönder
          </Button>
        </div>
      </form>
    </FormDrawer>
  );
}

function WorkspaceDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await createWorkspace({ name });
      if (res.success) {
        toast.success(res.message ?? "Oluşturuldu.");
        setName("");
        onOpenChange(false);
        router.refresh();
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
      }
    });
  }

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Yeni Çalışma Alanı" description="Yeni bir izole çalışma alanı oluşturun.">
      <form onSubmit={submit} className="space-y-4 pt-4">
        <Field label="Çalışma Alanı Adı" error={errors.name} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Vazgeç</Button>
          <Button type="submit" disabled={isPending} className="bg-[#5267ff] hover:bg-[#4254e1]">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Oluştur
          </Button>
        </div>
      </form>
    </FormDrawer>
  );
}
