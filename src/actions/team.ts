"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { MembershipRole } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import {
  requirePermission,
  PermissionError,
  assignableRolesFor,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { inviteEmail } from "@/lib/email/templates";
import { ok, fail, zodFail, type ActionResponse } from "@/lib/action-response";

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  console.error(error);
  return fail("İşlem sırasında beklenmeyen bir hata oluştu.");
}

const inviteSchema = z.object({
  name: z.string().trim().min(2, "Ad zorunludur.").max(150),
  email: z.email("Geçerli bir e-posta girin."),
  role: z.enum(["owner", "admin", "technical", "finance", "viewer"]),
});

/** Ekip üyesi davet et (e-posta bildirimli). RBAC atama kuralları uygulanır. */
export async function inviteMember(
  input: unknown
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("team.manage");
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { name, email, role } = parsed.data;

    // Admin yalnız alt rolleri, Owner rolünü yalnız Owner atayabilir
    if (!assignableRolesFor(ctx.role).includes(role)) {
      return fail("Bu rolü atama yetkiniz bulunmuyor.");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const workspaceId = ctx.workspaceId;

    const tempPassword = crypto.randomBytes(9).toString("base64url");
    const password_hash = await bcrypt.hash(tempPassword, 12);

    type InviteResult =
      | { kind: "error"; message: string }
      | { kind: "ok"; userId: string; isNew: boolean };

    const result = await prisma.$transaction(async (tx): Promise<InviteResult> => {
      let user = await tx.user.findUnique({ where: { email: normalizedEmail } });
      let isNew = false;
      if (!user) {
        user = await tx.user.create({
          data: {
            name,
            email: normalizedEmail,
            password_hash,
            force_password_reset: true,
            current_workspace_id: workspaceId,
          },
        });
        isNew = true;
      }

      const existing = await tx.workspaceUser.findUnique({
        where: {
          workspace_id_user_id: { workspace_id: workspaceId, user_id: user.id },
        },
      });
      if (existing) return { kind: "error", message: "Bu kullanıcı zaten çalışma alanında." };

      await tx.workspaceUser.create({
        data: {
          workspace_id: workspaceId,
          user_id: user.id,
          role,
          status: "active",
        },
      });
      return { kind: "ok", userId: user.id, isNew };
    });

    if (result.kind === "error") return fail(result.message);

    // Yeni kullanıcıya davet e-postası gönder
    if (result.isNew) {
      const loginUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/giris`;
      const mail = inviteEmail({
        workspaceName: ctx.workspaceName ?? "Çalışma Alanı",
        inviterName: ctx.user.name,
        email: normalizedEmail,
        tempPassword,
        loginUrl,
      });
      try {
        await sendEmail({ to: normalizedEmail, ...mail });
      } catch (error) {
        console.error("Davet e-postası gönderilemedi:", error);
      }
    }

    await writeAudit({
      workspace_id: workspaceId,
      actor_user_id: ctx.user.id,
      action: "INVITE_MEMBER",
      auditable_type: "workspace_user",
      auditable_id: result.userId,
      after_data: { email: normalizedEmail, role },
    });

    revalidatePath("/ekip");
    return ok(null, "Üye davet edildi.");
  } catch (error) {
    return handleError(error);
  }
}

/** Kalan aktif owner sayısı (son owner koruması için). */
async function activeOwnerCount(workspaceId: string): Promise<number> {
  return prisma.workspaceUser.count({
    where: { workspace_id: workspaceId, role: "owner", status: "active" },
  });
}

export async function changeMemberRole(
  membershipId: string,
  newRole: MembershipRole
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("team.manage");
    const workspaceId = ctx.workspaceId;

    const membership = await prisma.workspaceUser.findFirst({
      where: { id: membershipId, workspace_id: workspaceId },
    });
    if (!membership) return fail("Üyelik bulunamadı.");

    if (!assignableRolesFor(ctx.role).includes(newRole)) {
      return fail("Bu rolü atama yetkiniz bulunmuyor.");
    }
    // Owner rolünü almak için mevcut owner da yalnız owner tarafından değiştirilebilir
    if (membership.role === "owner" && ctx.role !== "owner") {
      return fail("Owner rolündeki bir üyeyi yalnızca Owner değiştirebilir.");
    }
    // Son aktif owner rolü düşürülemez
    if (
      membership.role === "owner" &&
      newRole !== "owner" &&
      (await activeOwnerCount(workspaceId)) <= 1
    ) {
      return fail("Son aktif Owner rolü değiştirilemez.");
    }

    await prisma.workspaceUser.update({
      where: { id: membershipId },
      data: { role: newRole },
    });

    await writeAudit({
      workspace_id: workspaceId,
      actor_user_id: ctx.user.id,
      action: "CHANGE_ROLE",
      auditable_type: "workspace_user",
      auditable_id: membershipId,
      before_data: { role: membership.role },
      after_data: { role: newRole },
    });

    revalidatePath("/ekip");
    return ok(null, "Üye rolü güncellendi.");
  } catch (error) {
    return handleError(error);
  }
}

export async function changeMemberStatus(
  membershipId: string,
  active: boolean
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("team.manage");
    const workspaceId = ctx.workspaceId;

    const membership = await prisma.workspaceUser.findFirst({
      where: { id: membershipId, workspace_id: workspaceId },
    });
    if (!membership) return fail("Üyelik bulunamadı.");

    // Kullanıcı kendi üyeliğini pasifleştiremez
    if (membership.user_id === ctx.user.id && !active) {
      return fail("Kendi üyeliğinizi pasifleştiremezsiniz.");
    }
    // Son aktif owner pasifleştirilemez
    if (
      membership.role === "owner" &&
      !active &&
      (await activeOwnerCount(workspaceId)) <= 1
    ) {
      return fail("Son aktif Owner pasifleştirilemez.");
    }

    await prisma.workspaceUser.update({
      where: { id: membershipId },
      data: { status: active ? "active" : "inactive" },
    });

    await writeAudit({
      workspace_id: workspaceId,
      actor_user_id: ctx.user.id,
      action: active ? "ACTIVATE_MEMBER" : "DEACTIVATE_MEMBER",
      auditable_type: "workspace_user",
      auditable_id: membershipId,
    });

    revalidatePath("/ekip");
    return ok(null, active ? "Üye aktifleştirildi." : "Üye pasifleştirildi.");
  } catch (error) {
    return handleError(error);
  }
}

const workspaceSchema = z.object({
  name: z.string().trim().min(2, "Çalışma alanı adı zorunludur.").max(150),
});

/** Yeni çalışma alanı oluştur ve kurucuyu owner yap. */
export async function createWorkspace(
  input: unknown
): Promise<ActionResponse<{ id: string }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return fail("Oturum bulunamadı.");
    const parsed = workspaceSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);

    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({ data: { name: parsed.data.name } });
      await tx.workspaceUser.create({
        data: {
          workspace_id: ws.id,
          user_id: ctx.user.id,
          role: "owner",
          status: "active",
        },
      });
      await tx.user.update({
        where: { id: ctx.user.id },
        data: { current_workspace_id: ws.id },
      });
      return ws;
    });

    await writeAudit({
      workspace_id: workspace.id,
      actor_user_id: ctx.user.id,
      action: "CREATE_WORKSPACE",
      auditable_type: "workspace",
      auditable_id: workspace.id,
      after_data: { name: workspace.name },
    });

    revalidatePath("/ekip");
    return ok({ id: workspace.id }, "Çalışma alanı oluşturuldu.");
  } catch (error) {
    return handleError(error);
  }
}

/** Aktif çalışma alanını değiştir (yalnızca üyesi olunan alanlar). */
export async function switchWorkspace(
  workspaceId: string
): Promise<ActionResponse<null>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return fail("Oturum bulunamadı.");

    const membership = await prisma.workspaceUser.findUnique({
      where: {
        workspace_id_user_id: { workspace_id: workspaceId, user_id: ctx.user.id },
      },
    });
    if (!membership || membership.status !== "active") {
      return fail("Bu çalışma alanına erişiminiz yok.");
    }

    await prisma.user.update({
      where: { id: ctx.user.id },
      data: { current_workspace_id: workspaceId },
    });

    revalidatePath("/", "layout");
    return ok(null, "Çalışma alanı değiştirildi.");
  } catch (error) {
    return handleError(error);
  }
}
