import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import {
  FinanceView,
  type InvoiceRow,
  type ScheduleRow,
} from "@/components/finans/finance-view";
import { formatMoney, toNumber } from "@/lib/format";
import { getExchangeRates } from "@/lib/exchange-rate";

export const metadata = { title: "Finans · Operasyon Merkezi" };

export default async function FinancePage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx?.role ?? null, "finance.manage")) {
    // Finans yalnızca yetkili roller içindir; salt-görüntüleme dahil değil
    if (!hasPermission(ctx?.role ?? null, "module.view")) redirect("/dashboard");
  }
  const canManage = hasPermission(ctx?.role ?? null, "finance.manage");

  const db = await getTenantDb();

  const [invoices, schedules, customers, projects, outstanding, overdueCount, rates] =
    await Promise.all([
      db.invoice.findMany({
        orderBy: { created_at: "desc" },
        take: 50,
        include: { customer: { select: { legal_name: true } } },
      }),
      db.billingSchedule.findMany({
        orderBy: { next_issue_on: "asc" },
        take: 50,
        include: { customer: { select: { legal_name: true } } },
      }),
      db.customer.findMany({
        where: { status: { not: "archived" } },
        orderBy: { legal_name: "asc" },
        select: { id: true, legal_name: true },
      }),
      db.project.findMany({
        where: { status: { not: "archived" } },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      }),
      db.invoice.aggregate({
        _sum: { balance_due: true },
        where: { status: { in: ["issued", "partial", "overdue"] } },
      }),
      db.invoice.count({ where: { status: "overdue" } }),
      // Dövizli tutarların TL karşılığı için TCMB günlük kuru (erişilemezse null)
      getExchangeRates(),
    ]);

  const invoiceRows: InvoiceRow[] = invoices.map((i) => ({
    id: i.id,
    invoice_no: i.invoice_no,
    customer_name: i.customer.legal_name,
    issued_on: i.issued_on.toISOString(),
    due_on: i.due_on.toISOString(),
    status: i.status,
    total: toNumber(i.total),
    paid_total: toNumber(i.paid_total),
    balance_due: toNumber(i.balance_due),
    currency: i.currency,
  }));

  const scheduleRows: ScheduleRow[] = schedules.map((s) => ({
    id: s.id,
    title: s.title,
    customer_name: s.customer.legal_name,
    amount: toNumber(s.amount),
    currency: s.currency,
    interval: `${s.interval_count} ${s.interval_unit === "month" ? "Ay" : "Yıl"}`,
    next_issue_on: s.next_issue_on.toISOString(),
    status: s.status,
  }));

  const customerOptions = customers.map((c) => ({ id: c.id, label: c.legal_name }));
  const projectOptions = projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }));

  return (
    <div className="space-y-6">
      <PageHeader title="Finans Merkezi" description="Faturaları, ödemeleri ve yinelenen planları yönetin." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard title="Açık Bakiye" value={formatMoney(toNumber(outstanding._sum.balance_due), "TRY")} icon="Wallet" tone="primary" />
        <KpiCard title="Gecikmiş Fatura" value={overdueCount} icon="AlertCircle" tone="danger" />
        <KpiCard title="Toplam Fatura" value={invoices.length} icon="FileText" />
      </div>

      <FinanceView
        invoices={invoiceRows}
        schedules={scheduleRows}
        customers={customerOptions}
        projects={projectOptions}
        rates={rates}
        canManage={canManage}
      />
    </div>
  );
}
