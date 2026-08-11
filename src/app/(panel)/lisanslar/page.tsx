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
import { LicensesView, type LicenseRow } from "@/components/lisanslar/licenses-view";
import { LICENSE_STATUS_OPTIONS } from "@/lib/validation/license";
import type { DomainItem } from "@/components/lisanslar/domain-manager";
import { parseOptionValue } from "@/lib/query-params";
import { buildLicenseDomainCandidates } from "@/lib/licenses/domain-candidates";

export const metadata = { title: "Lisanslar · Operasyon Merkezi" };

const licenseDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toDateInputValue(value: Date | null): string {
  if (!value) return "";
  const parts = Object.fromEntries(
    licenseDateFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function graceDayCount(expiresAt: Date | null, graceEndsAt: Date | null): number {
  if (!expiresAt || !graceEndsAt) return 0;
  return Math.max(
    0,
    Math.round((graceEndsAt.getTime() - expiresAt.getTime()) / (24 * 60 * 60 * 1000))
  );
}

export default async function LicensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.workspaceId || !ctx.role) redirect("/yetkisiz");
  const permissions = await getEffectivePermissions(ctx.workspaceId, ctx.role);
  if (!hasPermission(ctx.role, "licenses.view", permissions)) redirect("/yetkisiz");
  const { page, skip, take, search, status } = parseListParams(await searchParams);
  const db = await getTenantDb();

  const where: Prisma.LicenseWhereInput = {};
  const validStatus = parseOptionValue(status, LICENSE_STATUS_OPTIONS);
  if (validStatus) where.status = validStatus;
  if (search) {
    where.OR = [
      { product_name: { contains: search, mode: "insensitive" } },
      { key_prefix: { contains: search, mode: "insensitive" } },
      {
        domains: {
          some: { normalized_domain: { contains: search, mode: "insensitive" } },
        },
      },
      {
        project: {
          customer: { legal_name: { contains: search, mode: "insensitive" } },
        },
      },
    ];
  }

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    licenses,
    total,
    activeCount,
    expiringCount,
    suspendedCount,
    projects,
    inventoryDomains,
  ] =
    await Promise.all([
      db.license.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take,
        include: {
          project: {
            select: {
              code: true,
              name: true,
              customer: { select: { legal_name: true } },
            },
          },
          domains: true,
          _count: { select: { activations: { where: { status: "active" } } } },
        },
      }),
      db.license.count({ where }),
      db.license.count({ where: { status: "active" } }),
      db.license.count({
        where: { status: "active", expires_at: { gte: now, lte: in30 } },
      }),
      db.license.count({ where: { status: "suspended" } }),
      db.project.findMany({
        where: { status: { not: "archived" } },
        orderBy: { code: "asc" },
        take: FORM_OPTION_LIMIT,
        select: {
          id: true,
          customer_id: true,
          name: true,
          live_url: true,
          admin_url: true,
          customer: { select: { legal_name: true } },
          product: { select: { name: true } },
        },
      }),
      db.domain.findMany({
        where: { status: "active" },
        select: {
          name: true,
          normalized_name: true,
          customer_id: true,
          project_id: true,
        },
      }),
    ]);

  const rows: LicenseRow[] = licenses.map((l) => ({
    id: l.id,
    key_prefix: l.key_prefix,
    product_name: l.product_name,
    customer_name: l.project.customer.legal_name,
    project_name: l.project.name,
    project_code: l.project.code,
    status: l.status,
    expires_at: l.expires_at ? l.expires_at.toISOString() : null,
    starts_at_input: toDateInputValue(l.starts_at),
    expires_at_input: toDateInputValue(l.expires_at),
    grace_days: graceDayCount(l.expires_at, l.grace_ends_at),
    active_activations: l._count.activations,
    activation_limit: l.activation_limit,
    auto_suspend: l.auto_suspend,
    features: Array.isArray(l.features)
      ? l.features
          .filter((feature): feature is string => typeof feature === "string")
          .join(", ")
      : "",
    domains: l.domains.map(
      (d): DomainItem => ({
        id: d.id,
        domain: d.domain,
        normalized_domain: d.normalized_domain,
        environment: d.environment,
        is_primary: d.is_primary,
        status: d.status,
      })
    ),
  }));

  const projectOptions = projects.map((p) => ({
    id: p.id,
    label: `${p.name} - ${p.customer.legal_name}`,
    customer_name: p.customer.legal_name,
    product_name: p.product?.name ?? p.name,
    domain_candidates: buildLicenseDomainCandidates({
      liveUrl: p.live_url,
      adminUrl: p.admin_url,
      inventoryDomains: inventoryDomains.filter(
        (domain) =>
          domain.project_id === p.id ||
          (domain.project_id === null && domain.customer_id === p.customer_id)
      ),
    }),
  }));

  const canCreate = hasPermission(ctx.role, "licenses.create", permissions);
  const canUpdate = hasPermission(ctx.role, "licenses.update", permissions);
  const canDelete = hasPermission(ctx.role, "licenses.delete", permissions);

  return (
    <div className="space-y-6">
      <PageHeader title="Lisans Yönetimi" description="Lisans üretin, yenileyin ve doğrulayın." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard title="Aktif Lisans" value={activeCount} icon="KeyRound" tone="success" />
        <KpiCard title="30 Gün İçinde Bitiyor" value={expiringCount} icon="Clock" tone="primary" />
        <KpiCard title="Askıda" value={suspendedCount} icon="Ban" tone="danger" />
      </div>

      <ListToolbar
        statusOptions={LICENSE_STATUS_OPTIONS}
        searchPlaceholder="Ürün, müşteri, domain veya anahtar ara..."
      />
      <LicensesView
        licenses={rows}
        projects={projectOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
      <PaginationBar page={page} totalPages={pageCount(total)} totalItems={total} />
    </div>
  );
}
