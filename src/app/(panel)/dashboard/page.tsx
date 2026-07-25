import Link from "next/link";
import { getTenantDb } from "@/lib/db/tenant";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatDate, toNumber } from "@/lib/format";

export const metadata = { title: "Genel Bakış · Operasyon Merkezi" };

export default async function DashboardPage() {
  const db = await getTenantDb();
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    customerCount,
    activeProjectCount,
    activeLicenseCount,
    outstanding,
    expiringLicenses,
    overdueInvoices,
  ] = await Promise.all([
    db.customer.count({ where: { status: { not: "archived" } } }),
    db.project.count({ where: { status: { in: ["development", "testing", "live", "maintenance"] } } }),
    db.license.count({ where: { status: "active" } }),
    db.invoice.aggregate({
      _sum: { balance_due: true },
      where: { status: { in: ["issued", "partial", "overdue"] } },
    }),
    db.license.findMany({
      where: { status: { in: ["active", "grace"] }, expires_at: { gte: now, lte: in30 } },
      orderBy: { expires_at: "asc" },
      take: 6,
      include: { project: { select: { code: true } } },
    }),
    db.invoice.findMany({
      where: { status: "overdue" },
      orderBy: { due_on: "asc" },
      take: 6,
      include: { customer: { select: { legal_name: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Genel Bakış" description="Operasyon merkezinizin anlık durumu." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Aktif Müşteri" value={customerCount} icon="Users" tone="primary" />
        <KpiCard title="Aktif Proje" value={activeProjectCount} icon="FolderKanban" tone="default" />
        <KpiCard title="Aktif Lisans" value={activeLicenseCount} icon="KeyRound" tone="success" />
        <KpiCard title="Açık Bakiye" value={formatMoney(toNumber(outstanding._sum.balance_due), "TRY")} icon="Wallet" tone="danger" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between p-5">
            <h2 className="font-extrabold text-[#141821]">Süresi Yaklaşan Lisanslar</h2>
            <Link href="/lisanslar" className="text-sm font-medium text-[#5267ff] hover:underline">
              Tümü
            </Link>
          </div>
          {expiringLicenses.length === 0 ? (
            <div className="p-5 pt-0">
              <EmptyState icon="KeyRound" title="Yaklaşan lisans yok" description="30 gün içinde süresi dolan lisans bulunmuyor." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Ürün</TableHead>
                  <TableHead>Bitiş</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringLicenses.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="font-semibold text-[#141821]">{l.product_name}</div>
                      <div className="text-xs text-muted-foreground">{l.project.code}</div>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(l.expires_at)}</TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between p-5">
            <h2 className="font-extrabold text-[#141821]">Vadesi Geçmiş Faturalar</h2>
            <Link href="/finans" className="text-sm font-medium text-[#5267ff] hover:underline">
              Tümü
            </Link>
          </div>
          {overdueInvoices.length === 0 ? (
            <div className="p-5 pt-0">
              <EmptyState icon="FileText" title="Gecikmiş fatura yok" description="Harika! Tüm faturalar zamanında." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Fatura</TableHead>
                  <TableHead>Vade</TableHead>
                  <TableHead className="text-right">Bakiye</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueInvoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <div className="font-mono text-xs font-semibold">{i.invoice_no}</div>
                      <div className="text-xs text-muted-foreground">{i.customer.legal_name}</div>
                    </TableCell>
                    <TableCell className="text-sm text-rose-600">{formatDate(i.due_on)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {formatMoney(toNumber(i.balance_due), i.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
