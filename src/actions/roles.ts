"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, type ActionResponse } from "@/lib/action-response";
import { writeAudit } from "@/lib/audit";
import {
  normalizePermissions,
  type PermissionAction,
} from "@/lib/auth/permission-catalog";
import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logError } from "@/lib/logger";

const editableRoleSchema = z.enum(["technical", "finance", "viewer"]);

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  logError("action.role_permissions_failed", error);
  return fail("Rol yetkileri güncellenirken beklenmeyen bir hata oluştu.");
}

export async function updateRolePermissions(
  role: string,
  permissions: PermissionAction[]
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("roles.manage");
    const parsedRole = editableRoleSchema.safeParse(role);
    if (!parsedRole.success) {
      return fail("Sahip ve Yönetici rolleri değiştirilemez.");
    }

    const normalized = normalizePermissions(permissions);
    const previous = await prisma.workspaceRolePermission.findUnique({
      where: {
        workspace_id_role: {
          workspace_id: ctx.workspaceId,
          role: parsedRole.data,
        },
      },
      select: { permissions: true },
    });

    await prisma.workspaceRolePermission.upsert({
      where: {
        workspace_id_role: {
          workspace_id: ctx.workspaceId,
          role: parsedRole.data,
        },
      },
      create: {
        workspace_id: ctx.workspaceId,
        role: parsedRole.data,
        permissions: normalized,
        updated_by_user_id: ctx.user.id,
      },
      update: {
        permissions: normalized,
        updated_by_user_id: ctx.user.id,
      },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "UPDATE_ROLE_PERMISSIONS",
      auditable_type: "workspace_role_permission",
      auditable_id: parsedRole.data,
      before_data: { permissions: previous?.permissions ?? null },
      after_data: { permissions: normalized },
    });

    revalidatePath("/", "layout");
    revalidatePath("/rol-yonetimi");
    return ok(null, "Rol yetkileri güncellendi.");
  } catch (error) {
    return handleError(error);
  }
}

export async function resetRolePermissions(
  role: string
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("roles.manage");
    const parsedRole = editableRoleSchema.safeParse(role);
    if (!parsedRole.success) {
      return fail("Sahip ve Yönetici rolleri değiştirilemez.");
    }

    const previous = await prisma.workspaceRolePermission.findUnique({
      where: {
        workspace_id_role: {
          workspace_id: ctx.workspaceId,
          role: parsedRole.data,
        },
      },
      select: { permissions: true },
    });
    await prisma.workspaceRolePermission.deleteMany({
      where: { workspace_id: ctx.workspaceId, role: parsedRole.data },
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "RESET_ROLE_PERMISSIONS",
      auditable_type: "workspace_role_permission",
      auditable_id: parsedRole.data,
      before_data: { permissions: previous?.permissions ?? null },
      after_data: { permissions: "default" },
    });

    revalidatePath("/", "layout");
    revalidatePath("/rol-yonetimi");
    return ok(null, "Rol varsayılan yetkilerine döndürüldü.");
  } catch (error) {
    return handleError(error);
  }
}
