import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { getEffectivePermissions, hasPermission } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import {
  FORM_OPTION_LIMIT,
  parseListParams,
  pageCount,
  type SearchParams,
} from "@/lib/pagination";
import { PageHeader } from "@/components/page-header";
import { ListToolbar } from "@/components/list-toolbar";
import { PaginationBar } from "@/components/pagination-bar";
import { KpiCard } from "@/components/kpi-card";
import {
  DomainsView,
  type DomainRow,
  type LicenseDomainRow,
} from "@/components/domainler/domains-view";
import type { DomainFormValues } from "@/components/domainler/domain-form";
import {
  DOMAIN_FILTER_OPTIONS,
  DOMAIN_EXPIRY_FILTERS,
} from "@/lib/validation/domain";
import { daysUntil, EXPIRY_WARNING_DAYS } from "@/lib/domain";
import { parseOptionValue } from "@/lib/query-params";

export const metadata = { title: "Domainler · Operasyon Merkezi" };

/** Lisans domainleri sekmesinde taranan en yeni lisans sayısı. */
const LICENSE_SCAN_LIMIT = 200;

export default async function DomainsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.workspaceId || !ctx.role) redirect("/yetkisiz");
  const permissions = await getEffectivePermissions(ctx.workspaceId, ctx.role);
  if (!hasPermission(ctx.role, "domains.view", permissions)) redirect("/yetkisiz");
  const { page, skip, take, search, status } = parseListParams(await searchParams);
  const db = await getTenantDb();

  const now = new Date();
  const warningLimit = new Date(
    now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000
  );

  const where: Prisma.DomainWhereInput = {};
  const validStatus = parseOptionValue(status, DOMAIN_FILTER_OPTIONS);
  if (validStatus === DOMAIN_EXPIRY_FILTERS.expiring) {
    where.expires_at = { gte: now, lte: warningLimit };
  } else if (validStatus === DOMAIN_EXPIRY_FILTERS.overdue) {
    where.expires_at = { lt: now };
  } else if (validStatus) {
    where.status = validStatus;
  }
  if (search) {
    where.OR = [
      { normalized_name: { contains: search, mode: "insensitive" } },
      { registrar: { contains: search, mode: "insensitive" } },
      { nameservers: { contains: search, mode: "insensitive" } },
    ];
  }

  const [
    domains,
    total,
    trackedCount,
    expiringCount,
    overdueCount,
    sslExpiringCount,
    licenses,
    inventoryNames,
    customers,
    projects,
  ] = await Promise.all([
    db.domain.findMany({
      where,
      orderBy: [{ expires_at: { sort: "asc", nulls: "last" } }, { name: "asc" }],
      skip,
      take,
      include: {
        customer: { select: { legal_name: true } },
        project: { select: { code: true, name: true } },
      },
    }),
    db.domain.count({ where }),
    // KPI'lar liste filtresinden bağımsız, envanterin tamamını özetler
    db.domain.count(),
    db.domain.count({ where: { expires_at: { gte: now, lte: warningLimit } } }),
    db.domain.count({ where: { expires_at: { lt: now } } }),
    db.domain.count({ where: { ssl_expires_at: { gte: now, lte: warningLimit } } }),
    // Lisans domainleri workspace_id taşımaz; daima lisans üzerinden okunur
    db.license.findMany({
      where: { domains: { some: {} } },
      orderBy: { created_at: "desc" },
      take: LICENSE_SCAN_LIMIT,
      select: {
        key_prefix: true,
        product_name: true,
        project: { select: { code: true, name: true } },
        domains: {
          select: {
            id: true,
            domain: true,
            normalized_domain: true,
            environment: true,
            status: true,
          },
        },
      },
    }),
    db.domain.findMany({
      take: FORM_OPTION_LIMIT,
      select: { normalized_name: true },
    }),
    db.customer.findMany({
      where: { status: { not: "archived" } },
      orderBy: { legal_name: "asc" },
      take: FORM_OPTION_LIMIT,
      select: { id: true, legal_name: true },
    }),
    db.project.findMany({
      where: { status: { not: "archived" } },
      orderBy: { code: "asc" },
      take: FORM_OPTION_LIMIT,
      select: { id: true, code: true, name: true },
    }),
  ]);

  const licenseDomains: LicenseDomainRow[] = licenses.flatMap((l) =>
    l.domains.map((d) => ({
      id: d.id,
      domain: d.normalized_domain,
      environment: d.environment,
      status: d.status,
      license_label: `${l.key_prefix} · ${l.product_name}`,
      project_label: `${l.project.code} · ${l.project.name}`,
      in_inventory: false,
    }))
  );

  const inventorySet = new Set(inventoryNames.map((d) => d.normalized_name));
  for (const ld of licenseDomains) {
    ld.in_inventory = inventorySet.has(ld.domain);
  }

  // Envanter satırındaki "N lisans" rozeti için alan adı başına lisans domaini sayısı
  const licenseUsage = new Map<string, number>();
  for (const ld of licenseDomains) {
    licenseUsage.set(ld.domain, (licenseUsage.get(ld.domain) ?? 0) + 1);
  }

  const rows: DomainRow[] = domains.map((d) => {
    const raw: DomainFormValues = {
      id: d.id,
      name: d.name,
      registrar: d.registrar ?? "",
      registrar_url: d.registrar_url ?? "",
      customer_id: d.customer_id ?? "none",
      project_id: d.project_id ?? "none",
      status: d.status,
      registered_at: d.registered_at ? d.registered_at.toISOString().slice(0, 10) : "",
      expires_at: d.expires_at ? d.expires_at.toISOString().slice(0, 10) : "",
      ssl_expires_at: d.ssl_expires_at ? d.ssl_expires_at.toISOString().slice(0, 10) : "",
      auto_renew: d.auto_renew,
      nameservers: d.nameservers ?? "",
      annual_cost: d.annual_cost ? d.annual_cost.toString() : "",
      currency: d.currency,
      notes: d.notes ?? "",
    };

    return {
      id: d.id,
      name: d.normalized_name,
      registrar: d.registrar,
      registrar_url: d.registrar_url,
      project_label: d.project ? `${d.project.code} · ${d.project.name}` : null,
      customer_label: d.customer?.legal_name ?? null,
      status: d.status,
      auto_renew: d.auto_renew,
      expires_at: d.expires_at ? d.expires_at.toISOString() : null,
      expires_in_days: daysUntil(d.expires_at, now),
      ssl_expires_at: d.ssl_expires_at ? d.ssl_expires_at.toISOString() : null,
      ssl_in_days: daysUntil(d.ssl_expires_at, now),
      license_count: licenseUsage.get(d.normalized_name) ?? 0,
      raw,
    };
  });

  const customerOptions = customers.map((c) => ({ id: c.id, label: c.legal_name }));
  const projectOptions = projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }));

  const canCreate = hasPermission(ctx.role, "domains.create", permissions);
  const canUpdate = hasPermission(ctx.role, "domains.update", permissions);
  const canDelete = hasPermission(ctx.role, "domains.delete", permissions);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domain Takibi"
        description="Alan adı sürelerini, SSL bitişlerini ve lisans eşleşmelerini izleyin."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Takipteki Domain" value={trackedCount} icon="Globe" tone="primary" />
        <KpiCard title="30 Gün İçinde Bitiyor" value={expiringCount} icon="Clock" />
        <KpiCard title="Süresi Geçmiş" value={overdueCount} icon="CircleAlert" tone="danger" />
        <KpiCard title="SSL Yenilemesi Yakın" value={sslExpiringCount} icon="ShieldCheck" tone="success" />
      </div>

      <ListToolbar
        statusOptions={DOMAIN_FILTER_OPTIONS}
        searchPlaceholder="Alan adı, kayıt firması veya nameserver ara..."
      />
      <DomainsView
        domains={rows}
        licenseDomains={licenseDomains}
        customers={customerOptions}
        projects={projectOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
      <PaginationBar page={page} totalPages={pageCount(total)} totalItems={total} />
    </div>
  );
}
