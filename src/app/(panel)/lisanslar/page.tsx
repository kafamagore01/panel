import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
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

export const metadata = { title: "Lisanslar · Operasyon Merkezi" };

export default async function LicensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getAuthContext();
  const { page, skip, take, search, status } = parseListParams(await searchParams);
  const db = await getTenantDb();

  const where: Prisma.LicenseWhereInput = {};
  const validStatus = parseOptionValue(status, LICENSE_STATUS_OPTIONS);
  if (validStatus) where.status = validStatus;
  if (search) {
    where.OR = [
      { product_name: { contains: search, mode: "insensitive" } },
      { key_prefix: { contains: search, mode: "insensitive" } },
    ];
  }

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [licenses, total, activeCount, expiringCount, suspendedCount, projects] =
    await Promise.all([
      db.license.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take,
        include: {
          project: { select: { code: true } },
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
          name: true,
          customer: { select: { legal_name: true } },
          product: { select: { name: true } },
        },
      }),
    ]);

  const rows: LicenseRow[] = licenses.map((l) => ({
    id: l.id,
    key_prefix: l.key_prefix,
    product_name: l.product_name,
    project_code: l.project.code,
    status: l.status,
    expires_at: l.expires_at ? l.expires_at.toISOString() : null,
    active_activations: l._count.activations,
    activation_limit: l.activation_limit,
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
    product_name: p.product?.name ?? p.name,
  }));

  const canManage = hasPermission(ctx?.role ?? null, "record.manage");
  const canRotate = hasPermission(ctx?.role ?? null, "license.rotate");

  return (
    <div className="space-y-6">
      <PageHeader title="Lisans Yönetimi" description="Lisans üretin, yenileyin ve doğrulayın." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard title="Aktif Lisans" value={activeCount} icon="KeyRound" tone="success" />
        <KpiCard title="30 Gün İçinde Bitiyor" value={expiringCount} icon="Clock" tone="primary" />
        <KpiCard title="Askıda" value={suspendedCount} icon="Ban" tone="danger" />
      </div>

      <ListToolbar statusOptions={LICENSE_STATUS_OPTIONS} searchPlaceholder="Ürün adı veya anahtar öneki ara..." />
      <LicensesView licenses={rows} projects={projectOptions} canManage={canManage} canRotate={canRotate} />
      <PaginationBar page={page} totalPages={pageCount(total)} totalItems={total} />
    </div>
  );
}
