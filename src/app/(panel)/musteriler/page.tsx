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
import {
  CustomersView,
  type CustomerRow,
} from "@/components/musteriler/customers-view";
import { CUSTOMER_STATUS_OPTIONS } from "@/lib/validation/customer";
import { parseOptionValue } from "@/lib/query-params";

export const metadata = { title: "Müşteriler · Operasyon Merkezi" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getAuthContext();
  const { page, skip, take, search, status } = parseListParams(await searchParams);

  const db = await getTenantDb();

  const where: Prisma.CustomerWhereInput = {};
  const validStatus = parseOptionValue(status, CUSTOMER_STATUS_OPTIONS);
  if (validStatus) where.status = validStatus;
  if (search) {
    where.OR = [
      { legal_name: { contains: search, mode: "insensitive" } },
      { trade_name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { tax_number: { contains: search, mode: "insensitive" } },
    ];
  }

  const [customers, total, parentCustomers] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take,
      include: {
        parent_customer: { select: { legal_name: true } },
        _count: { select: { projects: true } },
      },
    }),
    db.customer.count({ where }),
    db.customer.findMany({
      where: { parent_customer_id: null },
      orderBy: { legal_name: "asc" },
      take: FORM_OPTION_LIMIT,
      select: { id: true, legal_name: true },
    }),
  ]);

  const rows: CustomerRow[] = customers.map((c) => ({
    id: c.id,
    type: c.type,
    legal_name: c.legal_name,
    trade_name: c.trade_name,
    email: c.email,
    phone: c.phone,
    status: c.status,
    parent_legal_name: c.parent_customer?.legal_name ?? null,
    project_count: c._count.projects,
    raw: {
      id: c.id,
      type: c.type,
      customer_kind: c.parent_customer_id ? "branch" : "headquarters",
      parent_customer_id: c.parent_customer_id ?? "",
      branch_name: c.branch_name ?? "",
      legal_name: c.legal_name,
      trade_name: c.trade_name ?? "",
      tax_number: c.tax_number ?? "",
      tax_office: c.tax_office ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      website_url: c.website_url ?? "",
      billing_address: c.billing_address ?? "",
      status: c.status,
      notes: c.notes ?? "",
    },
  }));

  const canManage = hasPermission(ctx?.role ?? null, "record.manage");
  const canArchive = hasPermission(ctx?.role ?? null, "record.archive");
  const parentOptions = parentCustomers.map((customer) => ({
    id: customer.id,
    label: customer.legal_name,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Müşteriler"
        description="Kurumsal ve bireysel müşterilerinizi yönetin."
      />
      <ListToolbar
        statusOptions={CUSTOMER_STATUS_OPTIONS}
        searchPlaceholder="Unvan, e-posta veya vergi no ara..."
      />
      <CustomersView
        customers={rows}
        parentOptions={parentOptions}
        canManage={canManage}
        canArchive={canArchive}
      />
      <PaginationBar page={page} totalPages={pageCount(total)} totalItems={total} />
    </div>
  );
}
