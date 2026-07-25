"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/status-badge";
import { FormDrawer } from "@/components/form-drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ServerForm, type ServerFormValues } from "./server-form";
import { ServerLinkManager, type ServerLink } from "./server-link-manager";
import type { Option } from "@/components/projeler/project-form";
import { archiveServer } from "@/actions/servers";

export type ServerRow = {
  id: string;
  name: string;
  type: string;
  provider: string | null;
  primary_ip: string | null;
  status: string;
  project_count: number;
  links: ServerLink[];
  raw: ServerFormValues;
};

export function ServersView({
  servers,
  projects,
  canManage,
  canArchive,
}: {
  servers: ServerRow[];
  projects: Option[];
  canManage: boolean;
  canArchive: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ServerFormValues | undefined>();
  const [linkTarget, setLinkTarget] = useState<ServerRow | null>(null);

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => { setEditing(undefined); setDrawerOpen(true); }} className="bg-[#5267ff] hover:bg-[#4254e1]">
            <Plus className="mr-1 h-4 w-4" />
            Yeni Sunucu
          </Button>
        </div>
      )}

      {servers.length === 0 ? (
        <EmptyState icon="Server" title="Sunucu bulunamadı" description="Envanterinize yeni bir sunucu ekleyin." />
      ) : (
        <div className="overflow-x-auto rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Sunucu</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Proje</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-semibold text-[#141821]">{s.name}</div>
                    {s.provider && <div className="text-xs text-muted-foreground">{s.provider}</div>}
                  </TableCell>
                  <TableCell className="text-sm uppercase">{s.type}</TableCell>
                  <TableCell className="font-mono text-xs">{s.primary_ip ?? "—"}</TableCell>
                  <TableCell className="text-sm tabular-nums">{s.project_count}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditing(s.raw); setDrawerOpen(true); }}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Düzenle
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLinkTarget(s)}>
                            <Network className="mr-2 h-4 w-4" />
                            Proje Eşleştir ({s.project_count})
                          </DropdownMenuItem>
                          {canArchive && s.status !== "terminated" && (
                            <ConfirmDialog
                              trigger={
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="text-rose-600 focus:text-rose-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Sonlandır
                                </DropdownMenuItem>
                              }
                              title="Sunucuyu Sonlandır"
                              description={`"${s.name}" sonlandırılacak ve envanterden kaldırılacak.`}
                              confirmLabel="Sonlandır"
                              destructive
                              action={() => archiveServer(s.id)}
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
      )}

      <FormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editing?.id ? "Sunucu Düzenle" : "Yeni Sunucu"}
        description="Sunucu envanter bilgilerini girin."
      >
        <ServerForm initial={editing} onDone={() => setDrawerOpen(false)} />
      </FormDrawer>

      {linkTarget && (
        <ServerLinkManager
          open={Boolean(linkTarget)}
          onOpenChange={(o) => !o && setLinkTarget(null)}
          serverId={linkTarget.id}
          links={linkTarget.links}
          projects={projects}
        />
      )}
    </>
  );
}
