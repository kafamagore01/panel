import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { getEffectivePermissions, hasPermission } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { prisma } from "@/lib/db/prisma";
import {
  FORM_OPTION_LIMIT,
  parseListParams,
  pageCount,
  type SearchParams,
} from "@/lib/pagination";
import { PageHeader } from "@/components/page-header";
import { ListToolbar } from "@/components/list-toolbar";
import { PaginationBar } from "@/components/pagination-bar";
import { ProjectsView, type ProjectRow } from "@/components/projeler/projects-view";
import { PROJECT_STATUS_OPTIONS } from "@/lib/validation/project";
import { getExchangeRates } from "@/lib/exchange-rate";
import { parseOptionValue } from "@/lib/query-params";

export const metadata = { title: "Projeler · Operasyon Merkezi" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getAuthContext();
  if (!ctx?.workspaceId || !ctx.role) redirect("/yetkisiz");
  const permissions = await getEffectivePermissions(ctx.workspaceId, ctx.role);
  if (!hasPermission(ctx.role, "projects.view", permissions)) redirect("/yetkisiz");
  const { page, skip, take, search, status } = parseListParams(await searchParams);
  const db = await getTenantDb();

  const where: Prisma.ProjectWhereInput = {};
  const validStatus = parseOptionValue(status, PROJECT_STATUS_OPTIONS);
  if (validStatus) where.status = validStatus;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { branch_name: { contains: search, mode: "insensitive" } },
    ];
  }

  const [projects, total, customers, products, memberships, sourceProjects, rates] =
    await Promise.all([
      db.project.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take,
        include: {
          customer: { select: { legal_name: true } },
          source_project: { select: { code: true } },
          _count: { select: { licenses: true } },
        },
      }),
      db.project.count({ where }),
      db.customer.findMany({
        where: { status: { not: "archived" } },
        orderBy: { legal_name: "asc" },
        take: FORM_OPTION_LIMIT,
        select: { id: true, legal_name: true },
      }),
      db.product.findMany({
        orderBy: { name: "asc" },
        take: FORM_OPTION_LIMIT,
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
            take: FORM_OPTION_LIMIT,
            include: { user: { select: { id: true, name: true } } },
          })
        : Promise.resolve([]),
      // Satış/kurulum için sayfalama dışında kalan tüm aktif kaynak projeler.
      db.project.findMany({
        where: { status: { not: "archived" } },
        orderBy: [{ name: "asc" }, { created_at: "asc" }],
        take: FORM_OPTION_LIMIT,
        select: {
          id: true,
          code: true,
          name: true,
          customer: { select: { legal_name: true } },
          product_id: true,
          owner_user_id: true,
          branch_name: true,
          description: true,
          repository_url: true,
          github_repo_id: true,
          github_repo_full_name: true,
          tech_stack: true,
        },
      }),
      // Dövizli bütçelerin TL karşılığı için TCMB günlük kuru (erişilemezse null)
      getExchangeRates(),
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
    github_repo_full_name: p.github_repo_full_name,
    source_project_code: p.source_project?.code ?? null,
    raw: {
      id: p.id,
      customer_id: p.customer_id,
      source_project_id: p.source_project_id ?? "",
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
      manual_fx_rate: p.manual_fx_rate ? p.manual_fx_rate.toString() : "",
      live_url: p.live_url ?? "",
      admin_url: p.admin_url ?? "",
      repository_url: p.repository_url ?? "",
      github_repo_id: p.github_repo_id ?? "",
      github_repo_full_name: p.github_repo_full_name ?? "",
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
  const sourceProjectOptions = sourceProjects.map((project) => ({
    id: project.id,
    label: `${project.code} · ${project.name} (${project.customer.legal_name})`,
    product_id: project.product_id ?? "",
    owner_user_id: project.owner_user_id ?? "",
    name: project.name,
    branch_name: project.branch_name ?? "",
    description: project.description ?? "",
    repository_url: project.repository_url ?? "",
    github_repo_id: project.github_repo_id ?? "",
    github_repo_full_name: project.github_repo_full_name ?? "",
    tech_stack: Array.isArray(project.tech_stack)
      ? (project.tech_stack as string[]).join(", ")
      : "",
  }));

  const canCreate = hasPermission(ctx.role, "projects.create", permissions);
  const canUpdate = hasPermission(ctx.role, "projects.update", permissions);
  const canDelete = hasPermission(ctx.role, "projects.delete", permissions);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projeler"
        description="Müşteri projelerini ve aynı repo üzerinden yapılan satışları yönetin."
      />
      <ListToolbar statusOptions={PROJECT_STATUS_OPTIONS} searchPlaceholder="Proje adı veya kod ara..." />
      <ProjectsView
        projects={rows}
        customers={customerOptions}
        products={productOptions}
        catalog={catalog}
        members={memberOptions}
        sourceProjects={sourceProjectOptions}
        rates={rates}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
      <PaginationBar page={page} totalPages={pageCount(total)} totalItems={total} />
    </div>
  );
}
