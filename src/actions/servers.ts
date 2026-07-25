"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { getTenantDb } from "@/lib/db/tenant";
import { writeAudit } from "@/lib/audit";
import { serverSchema, projectServerSchema } from "@/lib/validation/server";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  console.error(error);
  return fail("İşlem sırasında beklenmeyen bir hata oluştu.");
}

function buildData(data: ServerData) {
  return {
    name: data.name,
    provider: data.provider,
    external_ref: data.external_ref,
    type: data.type,
    hostname: data.hostname,
    primary_ip: data.primary_ip,
    region: data.region,
    operating_system: data.operating_system,
    cpu_cores: data.cpu_cores,
    ram_mb: data.ram_mb,
    disk_gb: data.disk_gb,
    management_url: data.management_url,
    ssh_port: data.ssh_port,
    ssh_user: data.ssh_user,
    status: data.status,
    renewal_at: data.renewal_at ? new Date(data.renewal_at) : null,
    monthly_cost: data.monthly_cost ?? null,
    currency: data.currency,
  };
}

type ServerData = ReturnType<typeof serverSchema.parse>;

export async function createServer(
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = serverSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);

    const db = await getTenantDb();
    const created = await db.server.create({
      data: { ...buildData(parsed.data), workspace_id: ctx.workspaceId },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "CREATE",
      auditable_type: "server",
      auditable_id: created.id,
      after_data: created,
    });

    revalidatePath("/sunucular");
    return ok({ id: created.id }, "Sunucu eklendi.");
  } catch (error) {
    return handleError(error);
  }
}

export async function updateServer(
  id: string,
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = serverSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);

    const db = await getTenantDb();
    const before = await db.server.findUnique({ where: { id } });
    if (!before) return fail("Sunucu bulunamadı.");

    const updated = await db.server.update({ where: { id }, data: buildData(parsed.data) });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "UPDATE",
      auditable_type: "server",
      auditable_id: id,
      before_data: before,
      after_data: updated,
    });

    revalidatePath("/sunucular");
    return ok({ id }, "Sunucu güncellendi.");
  } catch (error) {
    return handleError(error);
  }
}

export async function archiveServer(id: string): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.archive");
    const db = await getTenantDb();
    const server = await db.server.findUnique({ where: { id } });
    if (!server) return fail("Sunucu bulunamadı.");

    await db.server.update({
      where: { id },
      data: { status: "terminated", deleted_at: new Date() },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "ARCHIVE",
      auditable_type: "server",
      auditable_id: id,
      before_data: server,
    });

    revalidatePath("/sunucular");
    return ok(null, "Sunucu sonlandırıldı.");
  } catch (error) {
    return handleError(error);
  }
}

/** Proje-Sunucu pivot eşleştirmesi ekle. */
export async function linkProjectServer(
  input: unknown
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.manage");
    const parsed = projectServerSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { server_id, project_id, role, environment, is_primary } = parsed.data;

    const db = await getTenantDb();
    // İki kayıt da aynı workspace'te mi? (tenant katmanı zorlar)
    const [server, project] = await Promise.all([
      db.server.findUnique({ where: { id: server_id } }),
      db.project.findUnique({ where: { id: project_id } }),
    ]);
    if (!server || !project) return fail("Sunucu veya proje bulunamadı.");

    try {
      await db.$queryRaw`
        INSERT INTO project_server (id, project_id, server_id, role, environment, is_primary, created_at, updated_at)
        VALUES (gen_random_uuid(), ${project_id}::uuid, ${server_id}::uuid, ${role ?? null}, ${environment ?? null}, ${is_primary}, now(), now())
      `;
    } catch {
      return fail("Bu proje ve sunucu zaten eşleştirilmiş.");
    }

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "LINK_SERVER",
      auditable_type: "server",
      auditable_id: server_id,
      after_data: { project_id, role, environment },
    });

    revalidatePath("/sunucular");
    return ok(null, "Proje sunucuya eşleştirildi.");
  } catch (error) {
    return handleError(error);
  }
}

export async function unlinkProjectServer(
  serverId: string,
  projectId: string
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("record.manage");
    const db = await getTenantDb();
    const server = await db.server.findUnique({ where: { id: serverId } });
    if (!server) return fail("Sunucu bulunamadı.");

    await db.$queryRaw`
      DELETE FROM project_server WHERE server_id = ${serverId}::uuid AND project_id = ${projectId}::uuid
    `;

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "UNLINK_SERVER",
      auditable_type: "server",
      auditable_id: serverId,
      after_data: { project_id: projectId },
    });

    revalidatePath("/sunucular");
    return ok(null, "Eşleştirme kaldırıldı.");
  } catch (error) {
    return handleError(error);
  }
}
