"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
  DownloadCloud,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { DomainForm, type DomainFormValues } from "./domain-form";
import type { Option } from "@/components/projeler/project-form";
import { archiveDomain, importLicenseDomain } from "@/actions/domains";
import { expiryTone, type ExpiryTone } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DomainRow = {
  id: string;
  name: string;
  registrar: string | null;
  registrar_url: string | null;
  project_label: string | null;
  customer_label: string | null;
  status: string;
  auto_renew: boolean;
  expires_at: string | null;
  expires_in_days: number | null;
  ssl_expires_at: string | null;
  ssl_in_days: number | null;
  /** Aynı alan adını kullanan lisans domaini sayısı */
  license_count: number;
  raw: DomainFormValues;
};

export type LicenseDomainRow = {
  id: string;
  domain: string;
  environment: string;
  status: string;
  license_label: string;
  project_label: string;
  /** Envanterde bu alan adına ait kayıt var mı? */
  in_inventory: boolean;
};

const TONE_CLASS: Record<ExpiryTone, string> = {
  expired: "text-rose-600",
  critical: "text-rose-600",
  warning: "text-amber-600",
  ok: "text-emerald-600",
  none: "text-muted-foreground",
};

function expiryLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} gün önce doldu`;
  if (days === 0) return "Bugün doluyor";
  return `${days} gün kaldı`;
}

function ExpiryCell({ date, days }: { date: string | null; days: number | null }) {
  if (!date || days === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="space-y-0.5">
      <div className="text-sm">{formatDate(date)}</div>
      <div className={cn("text-xs font-semibold", TONE_CLASS[expiryTone(days)])}>
        {expiryLabel(days)}
      </div>
    </div>
  );
}

export function DomainsView({
  domains,
  licenseDomains,
  customers,
  projects,
  canCreate,
  canUpdate,
  canDelete,
}: {
  domains: DomainRow[];
  licenseDomains: LicenseDomainRow[];
  customers: Option[];
  projects: Option[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DomainFormValues | undefined>();
  const [importingId, setImportingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runImport(licenseDomainId: string) {
    setImportingId(licenseDomainId);
    startTransition(async () => {
      const res = await importLicenseDomain({ license_domain_id: licenseDomainId });
      if (res.success) {
        toast.success(res.message ?? "Envantere eklendi.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
      setImportingId(null);
    });
  }

  const unmatched = licenseDomains.filter((d) => !d.in_inventory).length;

  return (
    <Tabs defaultValue="inventory" className="space-y-4">
      <TabsList>
        <TabsTrigger value="inventory">Envanter ({domains.length})</TabsTrigger>
        <TabsTrigger value="licenses">
          Lisans Domainleri{unmatched > 0 ? ` · ${unmatched} eşleşmemiş` : ""}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="inventory" className="space-y-4">
        {canCreate && (
          <div className="flex justify-end">
            <Button
              onClick={() => { setEditing(undefined); setDrawerOpen(true); }}
              className="bg-[#5267ff] hover:bg-[#4254e1]"
            >
              <Plus className="mr-1 h-4 w-4" />
              Yeni Domain
            </Button>
          </div>
        )}

        {domains.length === 0 ? (
          <EmptyState
            icon="Globe"
            title="Domain bulunamadı"
            description="Takip etmek istediğiniz alan adlarını envantere ekleyin."
          />
        ) : (
          <div className="overflow-x-auto rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Alan Adı</TableHead>
                  <TableHead>Proje / Müşteri</TableHead>
                  <TableHead>Bitiş</TableHead>
                  <TableHead>SSL</TableHead>
                  <TableHead>Yenileme</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="font-mono text-sm font-semibold text-[#141821]">{d.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.registrar ?? "Kayıt firması belirtilmedi"}
                        {d.license_count > 0 && ` · ${d.license_count} lisans`}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{d.project_label ?? "—"}</div>
                      {d.customer_label && (
                        <div className="text-xs text-muted-foreground">{d.customer_label}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <ExpiryCell date={d.expires_at} days={d.expires_in_days} />
                    </TableCell>
                    <TableCell>
                      <ExpiryCell date={d.ssl_expires_at} days={d.ssl_in_days} />
                    </TableCell>
                    <TableCell>
                      {d.auto_renew ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <RefreshCw className="h-3.5 w-3.5" />
                          Otomatik
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Manuel</span>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={d.status} /></TableCell>
                    <TableCell>
                      {(canUpdate || canDelete) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canUpdate && <DropdownMenuItem onClick={() => { setEditing(d.raw); setDrawerOpen(true); }}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Düzenle
                            </DropdownMenuItem>}
                            {d.registrar_url && (
                              <DropdownMenuItem asChild>
                                <a href={d.registrar_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Kayıt Firması Paneli
                                </a>
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <ConfirmDialog
                                trigger={
                                  <DropdownMenuItem
                                    onSelect={(e) => e.preventDefault()}
                                    className="text-rose-600 focus:text-rose-600"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Envanterden Çıkar
                                  </DropdownMenuItem>
                                }
                                title="Alan Adını Envanterden Çıkar"
                                description={`"${d.name}" takip listesinden kaldırılacak.`}
                                confirmLabel="Çıkar"
                                destructive
                                action={() => archiveDomain(d.id)}
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
      </TabsContent>

      <TabsContent value="licenses" className="space-y-4">
        {licenseDomains.length === 0 ? (
          <EmptyState
            icon="KeyRound"
            title="Lisans domaini bulunamadı"
            description="Lisanslara domain tanımladığınızda burada listelenir."
          />
        ) : (
          <div className="overflow-x-auto rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Domain</TableHead>
                  <TableHead>Lisans</TableHead>
                  <TableHead>Proje</TableHead>
                  <TableHead>Ortam</TableHead>
                  <TableHead>Envanter</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenseDomains.map((ld) => (
                  <TableRow key={ld.id}>
                    <TableCell className="font-mono text-sm font-semibold text-[#141821]">
                      {ld.domain}
                    </TableCell>
                    <TableCell className="text-sm">{ld.license_label}</TableCell>
                    <TableCell className="text-sm">{ld.project_label}</TableCell>
                    <TableCell><StatusBadge status={ld.environment} /></TableCell>
                    <TableCell>
                      {ld.in_inventory ? (
                        <span className="text-xs font-semibold text-emerald-600">Takipte</span>
                      ) : canCreate ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runImport(ld.id)}
                          disabled={isPending}
                        >
                          {importingId === ld.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <DownloadCloud className="mr-1 h-3.5 w-3.5" />
                          )}
                          Envantere Ekle
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Takip dışı</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <FormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editing?.id ? "Domain Düzenle" : "Yeni Domain"}
        description="Alan adı, süre ve kayıt firması bilgilerini girin."
      >
        <DomainForm
          initial={editing}
          customers={customers}
          projects={projects}
          onDone={() => setDrawerOpen(false)}
        />
      </FormDrawer>
    </Tabs>
  );
}
