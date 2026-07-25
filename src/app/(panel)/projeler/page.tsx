import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { prisma } from "@/lib/db/prisma";
import { parseListParams, pageCount, type SearchParams } from "@/lib/pagination";
import { PageHeader } from "@/components/page-header";
import { ListToolbar } from "@/components/list-toolbar";
import { PaginationBar } from "@/components/pagination-bar";
import { ProjectsView, type ProjectRow } from "@/components/projeler/projects-view";
import { PROJECT_STATUS_OPTIONS } from "@/lib/validation/project";

export const metadata = { title: "Projeler · Operasyon Merkezi" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getAuthContext();
  const { page, skip, take, search, status } = parseListParams(await searchParams);
  const db = await getTenantDb();

  const where: Prisma.ProjectWhereInput = {};
  if (status) where.status = status as Prisma.ProjectWhereInput["status"];
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { branch_name: { contains: search, mode: "insensitive" } },
    ];
  }

  const [projects, total, customers, products, memberships] = await Promise.all([
    db.project.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take,
      include: {
        customer: { select: { legal_name: true } },
        _count: { select: { licenses: true } },
      },
    }),
    db.project.count({ where }),
    db.customer.findMany({
      where: { status: { not: "archived" } },
      orderBy: { legal_name: "asc" },
      select: { id: true, legal_name: true },
    }),
    db.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        repository_url: true,
        _count: { select: { projects: true } },
      },
    }),
    // Aktif üyeler (proje sorumlusu seçimi için)
    ctx?.workspaceId
      ? prisma.workspaceUser.findMany({
          where: { workspace_id: ctx.workspaceId, status: "active" },
          include: { user: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const rows: ProjectRow[] = projects.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    customer_name: p.customer.legal_name,
    status: p.status,
    branch_name: p.branch_name,
    live_url: p.live_url,
    license_count: p._count.licenses,
    raw: {
      id: p.id,
      customer_id: p.customer_id,
      product_id: p.product_id ?? "",
      owner_user_id: p.owner_user_id ?? "",
      name: p.name,
      branch_name: p.branch_name ?? "",
      description: p.description ?? "",
      status: p.status,
      start_date: p.start_date ? p.start_date.toISOString().slice(0, 10) : "",
      target_end_date: p.target_end_date ? p.target_end_date.toISOString().slice(0, 10) : "",
      budget: p.budget ? p.budget.toString() : "",
      currency: p.currency,
      live_url: p.live_url ?? "",
      admin_url: p.admin_url ?? "",
      repository_url: p.repository_url ?? "",
      tech_stack: Array.isArray(p.tech_stack) ? (p.tech_stack as string[]).join(", ") : "",
      notes: p.notes ?? "",
      license_webhook_url: p.license_webhook_url ?? "",
      license_webhook_secret: "",
    },
  }));

  const customerOptions = customers.map((c) => ({ id: c.id, label: c.legal_name }));
  const productOptions = products.map((p) => ({
    id: p.id,
    label: `${p.code} · ${p.name}`,
    name: p.name,
    repository_url: p.repository_url,
  }));
  const catalog = products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    repository_url: p.repository_url,
    project_count: p._count.projects,
  }));
  const memberOptions = memberships.map((m) => ({ id: m.user.id, label: m.user.name }));
  const branchBases = projects
    .filter((p) => p.status !== "archived")
    .map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }));

  const canManage = hasPermission(ctx?.role ?? null, "record.manage");
  const canArchive = hasPermission(ctx?.role ?? null, "record.archive");

  return (
    <div className="space-y-6">
      <PageHeader title="Projeler" description="Müşteri projelerini ve branch sürümlerini yönetin." />
      <ListToolbar statusOptions={PROJECT_STATUS_OPTIONS} searchPlaceholder="Proje adı veya kod ara..." />
      <ProjectsView
        projects={rows}
        customers={customerOptions}
        products={productOptions}
        catalog={catalog}
        members={memberOptions}
        branchBases={branchBases}
        canManage={canManage}
        canArchive={canArchive}
      />
      <PaginationBar page={page} totalPages={pageCount(total)} totalItems={total} />
    </div>
  );
}
