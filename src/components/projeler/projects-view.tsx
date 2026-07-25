"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, MoreHorizontal, Pencil, Archive, ExternalLink, Package } from "lucide-react";
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
import type { ExchangeRates } from "@/lib/currency";
import {
  ProjectForm,
  type ProjectFormValues,
  type Option,
  type ProductOption,
} from "./project-form";
import { ProductCatalog, type CatalogProduct } from "./product-catalog";
import { RepoCell } from "./repo-cell";
import { archiveProject } from "@/actions/projects";
import { fetchRepoSnapshots } from "@/actions/github";
import type { SnapshotResult } from "@/lib/github/repos";

export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  status: string;
  branch_name: string | null;
  live_url: string | null;
  license_count: number;
  github_repo_full_name: string | null;
  raw: ProjectFormValues;
};

export function ProjectsView({
  projects,
  customers,
  products,
  catalog,
  members,
  branchBases,
  rates,
  canManage,
  canArchive,
}: {
  projects: ProjectRow[];
  customers: Option[];
  products: ProductOption[];
  catalog: CatalogProduct[];
  members: Option[];
  branchBases: Option[];
  /** TCMB günlük kur bülteni; dövizli bütçelerin TL karşılığı için. */
  rates: ExchangeRates | null;
  canManage: boolean;
  canArchive: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectFormValues | undefined>();
  const snapshots = useRepoSnapshots(projects);

  function openNew() {
    setEditing(undefined);
    setDrawerOpen(true);
  }
  function openEdit(row: ProjectRow) {
    setEditing(row.raw);
    setDrawerOpen(true);
  }

  return (
    <>
      {canManage && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCatalogOpen(true)}>
            <Package className="mr-1 h-4 w-4" />
            Ürün Kataloğu
          </Button>
          <Button onClick={openNew} className="bg-[#5267ff] hover:bg-[#4254e1]">
            <Plus className="mr-1 h-4 w-4" />
            Yeni Proje
          </Button>
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState icon="FolderKanban" title="Proje bulunamadı" description="Yeni bir proje ekleyerek başlayın." />
      ) : (
        <div className="overflow-x-auto rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Kod</TableHead>
                <TableHead>Proje</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>GitHub</TableHead>
                <TableHead>Lisans</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs font-semibold">{p.code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 font-semibold text-[#141821]">
                      {p.name}
                      {p.live_url && (
                        <Link href={p.live_url} target="_blank" className="text-[#5267ff]">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                    {p.branch_name && (
                      <div className="text-xs text-muted-foreground">branch: {p.branch_name}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{p.customer_name}</TableCell>
                  <TableCell>
                    <RepoCell
                      fullName={p.github_repo_full_name}
                      result={
                        p.github_repo_full_name
                          ? snapshots[p.github_repo_full_name]
                          : undefined
                      }
                    />
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{p.license_count}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell>
                    {(canManage || canArchive) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canManage && (
                            <DropdownMenuItem onClick={() => openEdit(p)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Düzenle
                            </DropdownMenuItem>
                          )}
                          {canArchive && p.status !== "archived" && (
                            <ConfirmDialog
                              trigger={
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="text-rose-600 focus:text-rose-600"
                                >
                                  <Archive className="mr-2 h-4 w-4" />
                                  Arşivle
                                </DropdownMenuItem>
                              }
                              title="Projeyi Arşivle"
                              description={`"${p.name}" arşivlenecek. Lisansı veya sunucusu olan projeler arşivlenemez.`}
                              confirmLabel="Arşivle"
                              destructive
                              action={() => archiveProject(p.id)}
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
        title={editing?.id ? "Proje Düzenle" : "Yeni Proje"}
        description="Proje bilgilerini girin. Kod otomatik üretilir."
      >
        <ProjectForm
          initial={editing}
          customers={customers}
          products={products}
          members={members}
          branchBases={branchBases}
          rates={rates}
          onDone={() => setDrawerOpen(false)}
        />
      </FormDrawer>

      <ProductCatalog open={catalogOpen} onOpenChange={setCatalogOpen} products={catalog} />
    </>
  );
}

/**
 * Sayfadaki bağlı repoların canlı durumunu tek server action çağrısında çeker.
 * Sayfanın ilk render'ı GitHub'ı beklemez; hücreler veri gelince dolar.
 */
function useRepoSnapshots(projects: ProjectRow[]): Record<string, SnapshotResult> {
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotResult>>({});

  // Dizi kimliği her render'da değiştiği için bağımlılık sabit bir anahtar.
  const key = [
    ...new Set(projects.map((p) => p.github_repo_full_name).filter(Boolean)),
  ]
    .sort()
    .join(",");

  useEffect(() => {
    if (!key) return;
    let active = true;
    const names = key.split(",");

    fetchRepoSnapshots(names).then((res) => {
      if (!active) return;
      const data = res.success ? res.data : {};
      // Yanıtta karşılığı olmayan repolar için de bir sonuç yazılır; aksi halde
      // hücre kalıcı olarak yükleniyor görünümünde kalırdı.
      const fallback = res.success ? "Repo bilgisi alınamadı." : res.error;
      setSnapshots(
        Object.fromEntries(
          names.map((name) => [name, data[name] ?? { ok: false, error: fallback }])
        )
      );
    });

    return () => {
      active = false;
    };
  }, [key]);

  return snapshots;
}
