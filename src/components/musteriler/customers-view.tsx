"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
import {
  CustomerForm,
  type CustomerFormValues,
  type CustomerParentOption,
} from "./customer-form";
import { deleteCustomer } from "@/actions/customers";

export type CustomerRow = {
  id: string;
  type: string;
  legal_name: string;
  trade_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  parent_legal_name: string | null;
  project_count: number;
  raw: CustomerFormValues;
};

export function CustomersView({
  customers,
  parentOptions,
  canManage,
  canArchive,
}: {
  customers: CustomerRow[];
  parentOptions: CustomerParentOption[];
  canManage: boolean;
  canArchive: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerFormValues | undefined>();

  function openNew() {
    setEditing(undefined);
    setDrawerOpen(true);
  }
  function openEdit(row: CustomerRow) {
    setEditing(row.raw);
    setDrawerOpen(true);
  }

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={openNew} className="bg-[#5267ff] hover:bg-[#4254e1]">
            <Plus className="mr-1 h-4 w-4" />
            Yeni Müşteri
          </Button>
        </div>
      )}

      {customers.length === 0 ? (
        <EmptyState
          icon="Users"
          title="Müşteri bulunamadı"
          description="Arama kriterlerinizi değiştirin veya yeni bir müşteri ekleyin."
        />
      ) : (
        <div className="overflow-x-auto rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Müşteri</TableHead>
                <TableHead>İletişim</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Proje</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-semibold text-[#141821]">{c.legal_name}</div>
                    {c.parent_legal_name ? (
                      <div className="text-xs text-muted-foreground">
                        Şube · {c.parent_legal_name}
                      </div>
                    ) : c.trade_name ? (
                      <div className="text-xs text-muted-foreground">{c.trade_name}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{c.email ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{c.phone ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.type === "company" ? "Kurumsal" : "Bireysel"}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{c.project_count}</TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
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
                            <DropdownMenuItem onClick={() => openEdit(c)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Düzenle
                            </DropdownMenuItem>
                          )}
                          {canArchive && c.status !== "archived" && (
                            <ConfirmDialog
                              trigger={
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="text-rose-600 focus:text-rose-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Sil
                                </DropdownMenuItem>
                              }
                              title="Müşteriyi Sil"
                              description={`"${c.legal_name}" silinecek. Projesi veya bağlı şubesi olan müşteriler silinemez.`}
                              confirmLabel="Sil"
                              destructive
                              action={() => deleteCustomer(c.id)}
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
        title={editing?.id ? "Müşteri Düzenle" : "Yeni Müşteri"}
        description="Müşteri bilgilerini girin."
      >
        <CustomerForm
          initial={editing}
          parentOptions={parentOptions}
          onDone={() => setDrawerOpen(false)}
        />
      </FormDrawer>
    </>
  );
}
