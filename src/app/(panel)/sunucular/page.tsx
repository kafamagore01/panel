import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { parseListParams, pageCount, type SearchParams } from "@/lib/pagination";
import { PageHeader } from "@/components/page-header";
import { ListToolbar } from "@/components/list-toolbar";
import { PaginationBar } from "@/components/pagination-bar";
import { ServersView, type ServerRow } from "@/components/sunucular/servers-view";
import type { ServerLink } from "@/components/sunucular/server-link-manager";
import { SERVER_STATUS_OPTIONS } from "@/lib/validation/server";
import { getExchangeRates } from "@/lib/exchange-rate";

export const metadata = { title: "Sunucular · Operasyon Merkezi" };

export default async function ServersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getAuthContext();
  const { page, skip, take, search, status } = parseListParams(await searchParams);
  const db = await getTenantDb();

  const where: Prisma.ServerWhereInput = {};
  if (status) where.status = status as Prisma.ServerWhereInput["status"];
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { hostname: { contains: search, mode: "insensitive" } },
      { primary_ip: { contains: search, mode: "insensitive" } },
      { provider: { contains: search, mode: "insensitive" } },
    ];
  }

  const [servers, total, projects, rates] = await Promise.all([
    db.server.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take,
      include: {
        project_links: {
          include: { project: { select: { code: true, name: true } } },
        },
      },
    }),
    db.server.count({ where }),
    db.project.findMany({
      where: { status: { not: "archived" } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    getExchangeRates(),
  ]);

  const rows: ServerRow[] = servers.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    provider: s.provider,
    primary_ip: s.primary_ip,
    status: s.status,
    project_count: s.project_links.length,
    links: s.project_links.map(
      (pl): ServerLink => ({
        project_id: pl.project_id,
        project_label: `${pl.project.code} · ${pl.project.name}`,
        role: pl.role,
        environment: pl.environment,
      })
    ),
    raw: {
      id: s.id,
      name: s.name,
      provider: s.provider ?? "",
      external_ref: s.external_ref ?? "",
      type: s.type,
      hostname: s.hostname ?? "",
      primary_ip: s.primary_ip ?? "",
      region: s.region ?? "",
      operating_system: s.operating_system ?? "",
      cpu_cores: s.cpu_cores?.toString() ?? "",
      ram_mb: s.ram_mb?.toString() ?? "",
      disk_gb: s.disk_gb?.toString() ?? "",
      management_url: s.management_url ?? "",
      ssh_port: s.ssh_port.toString(),
      ssh_user: s.ssh_user ?? "",
      status: s.status,
      renewal_at: s.renewal_at ? s.renewal_at.toISOString().slice(0, 10) : "",
      monthly_cost: s.monthly_cost ? s.monthly_cost.toString() : "",
      cost_period: s.cost_period,
      currency: s.currency,
      manual_fx_rate: s.manual_fx_rate ? s.manual_fx_rate.toString() : "",
    },
  }));

  const projectOptions = projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }));

  const canManage = hasPermission(ctx?.role ?? null, "record.manage");
  const canArchive = hasPermission(ctx?.role ?? null, "record.archive");

  return (
    <div className="space-y-6">
      <PageHeader title="Sunucu Envanteri" description="Sunucularınızı ve proje eşleştirmelerini yönetin." />
      <ListToolbar statusOptions={SERVER_STATUS_OPTIONS} searchPlaceholder="Ad, hostname veya IP ara..." />
      <ServersView
        servers={rows}
        projects={projectOptions}
        rates={rates}
        canManage={canManage}
        canArchive={canArchive}
      />
      <PaginationBar page={page} totalPages={pageCount(total)} totalItems={total} />
    </div>
  );
}
