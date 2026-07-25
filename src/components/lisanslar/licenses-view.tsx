"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  RefreshCw,
  Eye,
  RotateCcw,
  KeyRound,
  Globe,
  SlidersHorizontal,
} from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/status-badge";
import { FormDrawer } from "@/components/form-drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { LicenseForm } from "./license-form";
import { LicenseKeyDialog } from "./license-key-dialog";
import { StatusChangeDialog } from "./status-change-dialog";
import { DomainManager, type DomainItem } from "./domain-manager";
import type { Option } from "@/components/projeler/project-form";
import {
  renewLicense,
  revealLicenseKey,
  resetActivations,
  rotateLicenseKey,
} from "@/actions/licenses";
import { formatDate } from "@/lib/format";
import { useRouter } from "next/navigation";

export type LicenseRow = {
  id: string;
  key_prefix: string;
  product_name: string;
  project_code: string;
  status: string;
  expires_at: string | null;
  active_activations: number;
  activation_limit: number;
  domains: DomainItem[];
};

export function LicensesView({
  licenses,
  projects,
  canManage,
  canRotate,
}: {
  licenses: LicenseRow[];
  projects: Array<Option & { product_name: string }>;
  canManage: boolean;
  canRotate: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [keyToShow, setKeyToShow] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<LicenseRow | null>(null);
  const [domainTarget, setDomainTarget] = useState<LicenseRow | null>(null);
  const [, startTransition] = useTransition();

  function reveal(id: string) {
    startTransition(async () => {
      const res = await revealLicenseKey(id);
      if (res.success) setKeyToShow(res.data.licenseKey);
      else toast.error(res.error);
    });
  }

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)} className="bg-[#5267ff] hover:bg-[#4254e1]">
            <Plus className="mr-1 h-4 w-4" />
            Yeni Lisans Üret
          </Button>
        </div>
      )}

      {licenses.length === 0 ? (
        <EmptyState icon="KeyRound" title="Lisans bulunamadı" description="Bir proje için yeni lisans üretin." />
      ) : (
        <div className="overflow-x-auto rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Anahtar</TableHead>
                <TableHead>Ürün / Proje</TableHead>
                <TableHead>Aktivasyon</TableHead>
                <TableHead>Bitiş</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licenses.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs font-semibold">{l.key_prefix}-••••</TableCell>
                  <TableCell>
                    <div className="font-semibold text-[#141821]">{l.product_name}</div>
                    <div className="text-xs text-muted-foreground">{l.project_code}</div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {l.active_activations} / {l.activation_limit}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(l.expires_at)}</TableCell>
                  <TableCell><StatusBadge status={l.status} /></TableCell>
                  <TableCell>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => setStatusTarget(l)}>
                            <SlidersHorizontal className="mr-2 h-4 w-4" />
                            Durum Değiştir
                          </DropdownMenuItem>
                          <ConfirmDialog
                            trigger={
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                1 Yıl Yenile
                              </DropdownMenuItem>
                            }
                            title="Lisansı Yenile"
                            description="Lisans süresine 1 yıl eklenecek. Onaylıyor musunuz?"
                            confirmLabel="Yenile"
                            action={() => renewLicense(l.id)}
                          />
                          <DropdownMenuItem onClick={() => reveal(l.id)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Anahtarı Göster
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDomainTarget(l)}>
                            <Globe className="mr-2 h-4 w-4" />
                            Domainler ({l.domains.length})
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <ConfirmDialog
                            trigger={
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Aktivasyonları Sıfırla
                              </DropdownMenuItem>
                            }
                            title="Aktivasyonları Sıfırla"
                            description="Tüm aktif kurulumlar devre dışı bırakılacak. Onaylıyor musunuz?"
                            confirmLabel="Sıfırla"
                            destructive
                            action={() => resetActivations(l.id)}
                          />
                          {canRotate && (
                            <ConfirmDialog
                              trigger={
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="text-rose-600 focus:text-rose-600"
                                >
                                  <KeyRound className="mr-2 h-4 w-4" />
                                  Anahtar Rotasyonu
                                </DropdownMenuItem>
                              }
                              title="Anahtar Rotasyonu"
                              description="Yeni bir anahtar üretilecek; eski anahtar geçersizleşecek ve tüm aktivasyonlar deaktive olacak. Bu işlem geri alınamaz."
                              confirmLabel="Döndür"
                              destructive
                              action={async () => {
                                const res = await rotateLicenseKey(l.id);
                                if (res.success) {
                                  setKeyToShow(res.data.licenseKey);
                                  router.refresh();
                                }
                                return res;
                              }}
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
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Yeni Lisans Üret"
        description="Proje ve süre bilgilerini girin. Anahtar tek seferlik gösterilecektir."
      >
        <LicenseForm
          projects={projects}
          onCreated={(key) => {
            setCreateOpen(false);
            setKeyToShow(key);
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </FormDrawer>

      <LicenseKeyDialog licenseKey={keyToShow} onClose={() => setKeyToShow(null)} />

      {statusTarget && (
        <StatusChangeDialog
          open={Boolean(statusTarget)}
          onOpenChange={(o) => !o && setStatusTarget(null)}
          licenseId={statusTarget.id}
          currentStatus={statusTarget.status}
        />
      )}

      {domainTarget && (
        <DomainManager
          open={Boolean(domainTarget)}
          onOpenChange={(o) => !o && setDomainTarget(null)}
          licenseId={domainTarget.id}
          domains={domainTarget.domains}
        />
      )}
    </>
  );
}
