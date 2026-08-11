"use client";

import { useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Ban,
  CreditCard,
  Pause,
  Play,
  Pencil,
  FileDown,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/status-badge";
import { FormDrawer } from "@/components/form-drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import {
  InvoiceForm,
  type InvoiceFormInitialData,
  type InvoiceProjectOption,
} from "./invoice-form";
import { ScheduleForm } from "./schedule-form";
import { PaymentDialog } from "./payment-dialog";
import type { Option } from "@/components/projeler/project-form";
import { voidInvoice, toggleSchedule } from "@/actions/finance";
import { formatMoney, formatDate } from "@/lib/format";
import type { ExchangeRates } from "@/lib/currency";

export type InvoiceRow = InvoiceFormInitialData & {
  invoice_no: string;
  customer_name: string;
  issued_on: string;
  due_on: string;
  status: string;
  total: number;
  paid_total: number;
  balance_due: number;
};

export type ScheduleRow = {
  id: string;
  title: string;
  customer_name: string;
  amount: number;
  currency: string;
  interval: string;
  next_issue_on: string;
  status: string;
};

export function FinanceView({
  invoices,
  schedules,
  customers,
  projects,
  rates,
  canCreate,
  canUpdate,
  canDelete,
}: {
  invoices: InvoiceRow[];
  schedules: ScheduleRow[];
  customers: Option[];
  projects: InvoiceProjectOption[];
  /** TCMB günlük kur bülteni; dövizli tutarların TL karşılığı için. */
  rates: ExchangeRates | null;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const [invoiceDrawer, setInvoiceDrawer] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRow | null>(null);
  const [scheduleDrawer, setScheduleDrawer] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<InvoiceRow | null>(null);

  return (
    <Tabs defaultValue="invoices" className="space-y-4">
      <TabsList>
        <TabsTrigger value="invoices">Faturalar</TabsTrigger>
        <TabsTrigger value="schedules">Yinelenen Planlar</TabsTrigger>
      </TabsList>

      <TabsContent value="invoices" className="space-y-4">
        {canCreate && (
          <div className="flex justify-end">
            <Button onClick={() => setInvoiceDrawer(true)} className="bg-[#5267ff] hover:bg-[#4254e1]">
              <Plus className="mr-1 h-4 w-4" />
              Fatura Oluştur
            </Button>
          </div>
        )}

        {invoices.length === 0 ? (
          <EmptyState icon="FileText" title="Fatura bulunamadı" description="Yeni bir fatura oluşturun." />
        ) : (
          <div className="overflow-x-auto rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Fatura No</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Vade</TableHead>
                  <TableHead className="text-right">Toplam</TableHead>
                  <TableHead className="text-right">Bakiye</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs font-semibold">{i.invoice_no}</TableCell>
                    <TableCell className="text-sm">{i.customer_name}</TableCell>
                    <TableCell className="text-sm">{formatDate(i.due_on)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">{formatMoney(i.total, i.currency)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatMoney(i.balance_due, i.currency)}</TableCell>
                    <TableCell><StatusBadge status={i.status} /></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`${i.invoice_no} işlemleri`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canUpdate &&
                            ["issued", "overdue"].includes(i.status) &&
                            i.paid_total === 0 && (
                              <DropdownMenuItem onClick={() => setEditingInvoice(i)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Faturayı Düzenle
                              </DropdownMenuItem>
                            )}
                          {canCreate && i.status !== "paid" && i.status !== "void" && (
                            <DropdownMenuItem onClick={() => setPaymentTarget(i)}>
                              <CreditCard className="mr-2 h-4 w-4" />
                              Ödeme Kaydet
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <a href={`/api/invoices/${i.id}/pdf`}>
                              <FileDown className="mr-2 h-4 w-4" />
                              PDF İndir
                            </a>
                          </DropdownMenuItem>
                          {canDelete &&
                            ["issued", "overdue"].includes(i.status) &&
                            i.paid_total === 0 && (
                              <>
                                <DropdownMenuSeparator />
                                <ConfirmDialog
                                  trigger={
                                    <DropdownMenuItem
                                      onSelect={(e) => e.preventDefault()}
                                      className="text-rose-600 focus:text-rose-600"
                                    >
                                      <Ban className="mr-2 h-4 w-4" />
                                      Faturayı İptal Et
                                    </DropdownMenuItem>
                                  }
                                  title="Faturayı İptal Et"
                                  description={`${i.invoice_no} numaralı fatura iptal edilecek (void). Ödeme alınmış faturalar iptal edilemez.`}
                                  confirmLabel="İptal Et"
                                  destructive
                                  action={() => voidInvoice(i.id)}
                                />
                              </>
                            )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="schedules" className="space-y-4">
        {canCreate && (
          <div className="flex justify-end">
            <Button onClick={() => setScheduleDrawer(true)} className="bg-[#5267ff] hover:bg-[#4254e1]">
              <Plus className="mr-1 h-4 w-4" />
              Plan Oluştur
            </Button>
          </div>
        )}

        {schedules.length === 0 ? (
          <EmptyState icon="CalendarClock" title="Plan bulunamadı" description="Yinelenen ödeme planı oluşturun." />
        ) : (
          <div className="overflow-x-auto rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Başlık</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead>Periyot</TableHead>
                  <TableHead>Sonraki Fatura</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-semibold text-[#141821]">{s.title}</TableCell>
                    <TableCell className="text-sm">{s.customer_name}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">{formatMoney(s.amount, s.currency)}</TableCell>
                    <TableCell className="text-sm">{s.interval}</TableCell>
                    <TableCell className="text-sm">{formatDate(s.next_issue_on)}</TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    <TableCell>
                      {canUpdate && s.status !== "completed" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {s.status === "active" ? (
                              <ConfirmDialog
                                trigger={
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                    <Pause className="mr-2 h-4 w-4" />
                                    Duraklat
                                  </DropdownMenuItem>
                                }
                                title="Planı Duraklat"
                                description="Plan duraklatılacak; yeni fatura üretilmeyecek."
                                confirmLabel="Duraklat"
                                action={() => toggleSchedule(s.id, true)}
                              />
                            ) : (
                              <ConfirmDialog
                                trigger={
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                    <Play className="mr-2 h-4 w-4" />
                                    Yeniden Başlat
                                  </DropdownMenuItem>
                                }
                                title="Planı Yeniden Başlat"
                                description="Plan tekrar aktifleştirilecek."
                                confirmLabel="Başlat"
                                action={() => toggleSchedule(s.id, false)}
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

      <FormDrawer open={invoiceDrawer} onOpenChange={setInvoiceDrawer} title="Fatura Oluştur" description="KDV ve müşteri anlık görüntüsü otomatik hesaplanır.">
        <InvoiceForm customers={customers} projects={projects} rates={rates} onDone={() => setInvoiceDrawer(false)} />
      </FormDrawer>

      {editingInvoice && (
        <FormDrawer
          open={Boolean(editingInvoice)}
          onOpenChange={(open) => !open && setEditingInvoice(null)}
          title="Faturayı Düzenle"
          description={`${editingInvoice.invoice_no} numaralı faturanın bilgilerini güncelleyin.`}
        >
          <InvoiceForm
            key={editingInvoice.id}
            customers={customers}
            projects={projects}
            rates={rates}
            invoice={editingInvoice}
            onDone={() => setEditingInvoice(null)}
          />
        </FormDrawer>
      )}

      <FormDrawer open={scheduleDrawer} onOpenChange={setScheduleDrawer} title="Yinelenen Plan" description="Otomatik fatura üretimi için periyodik plan tanımlayın.">
        <ScheduleForm customers={customers} projects={projects} rates={rates} onDone={() => setScheduleDrawer(false)} />
      </FormDrawer>

      {paymentTarget && (
        <PaymentDialog
          open={Boolean(paymentTarget)}
          onOpenChange={(o) => !o && setPaymentTarget(null)}
          invoiceId={paymentTarget.id}
          invoiceNo={paymentTarget.invoice_no}
          balanceDue={paymentTarget.balance_due}
          currency={paymentTarget.currency}
        />
      )}
    </Tabs>
  );
}
