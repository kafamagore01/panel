"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { MembershipRole, Prisma } from "@/generated/prisma/client";
import {
  getAuthContext,
  isPasswordResetRequired,
  PASSWORD_RESET_REQUIRED_MESSAGE,
} from "@/lib/auth/context";
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
import { logError } from "@/lib/logger";

function handleError(error: unknown): ActionResponse<never> {
  if (error instanceof PermissionError) return fail(error.message);
  logError("action.team_failed", error);
  return fail("İşlem sırasında beklenmeyen bir hata oluştu.");
}

const inviteSchema = z.object({
  name: z.string().trim().min(2, "Ad zorunludur.").max(150),
  email: z.email("Geçerli bir e-posta girin."),
  role: z.enum(["owner", "admin", "technical", "finance", "viewer"]),
});
const membershipRoleSchema = z.enum([
  "owner",
  "admin",
  "technical",
  "finance",
  "viewer",
]);
const membershipIdSchema = z.uuid("Üyelik kimliği geçersiz.");

/** Ekip üyesi davet et (e-posta bildirimli). RBAC atama kuralları uygulanır. */
export async function inviteMember(
  input: unknown
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("team.create");
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
      | {
          kind: "ok";
          userId: string;
          membershipId: string;
          isNew: boolean;
        };

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

      const membership = await tx.workspaceUser.create({
        data: {
          workspace_id: workspaceId,
          user_id: user.id,
          role,
          // Yeni hesap, geçici parola gerçekten gönderilene kadar erişim kazanmaz.
          status: isNew ? "inactive" : "active",
        },
      });
      return {
        kind: "ok",
        userId: user.id,
        membershipId: membership.id,
        isNew,
      };
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
        try {
          await prisma.$transaction(async (tx) => {
            await tx.workspaceUser.deleteMany({
              where: {
                id: result.membershipId,
                workspace_id: workspaceId,
                user_id: result.userId,
                status: "inactive",
              },
            });
            await tx.user.deleteMany({
              where: {
                id: result.userId,
                email: normalizedEmail,
                sessions: { none: {} },
                memberships: { none: {} },
              },
            });
          });
        } catch (cleanupError) {
          console.error("Başarısız davet geri alınamadı:", cleanupError);
        }
        return fail(
          "Davet e-postası gönderilemedi; üyelik etkinleştirilmedi."
        );
      }
      const activated = await prisma.workspaceUser.updateMany({
        where: {
          id: result.membershipId,
          workspace_id: workspaceId,
          user_id: result.userId,
          status: "inactive",
        },
        data: { status: "active" },
      });
      if (activated.count !== 1) {
        await prisma.$transaction(async (tx) => {
          await tx.workspaceUser.deleteMany({
            where: {
              id: result.membershipId,
              workspace_id: workspaceId,
              user_id: result.userId,
              status: "inactive",
            },
          });
          await tx.user.deleteMany({
            where: {
              id: result.userId,
              sessions: { none: {} },
              memberships: { none: {} },
            },
          });
        });
        return fail(
          "Davet gönderildi ancak üyelik etkinleştirilemedi. İşlemi yeniden deneyin."
        );
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

/** Owner invariant'ını değiştiren işlemleri workspace satırında seri hale getirir. */
async function lockWorkspaceForOwnerChange(
  tx: Prisma.TransactionClient,
  workspaceId: string
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM workspaces
    WHERE id = ${workspaceId}::uuid
    FOR UPDATE
  `;
  return rows.length === 1;
}

export async function changeMemberRole(
  membershipId: string,
  newRole: MembershipRole
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("team.update");
    const workspaceId = ctx.workspaceId;
    if (!membershipIdSchema.safeParse(membershipId).success) {
      return fail("Üyelik kimliği geçersiz.");
    }
    const parsedRole = membershipRoleSchema.safeParse(newRole);
    if (!parsedRole.success) return fail("Geçersiz üyelik rolü.");
    const requestedRole = parsedRole.data;

    type RoleChangeResult =
      | { kind: "error"; message: string }
      | { kind: "ok"; previousRole: MembershipRole };

    const result = await prisma.$transaction(
      async (tx): Promise<RoleChangeResult> => {
        if (!(await lockWorkspaceForOwnerChange(tx, workspaceId))) {
          return { kind: "error", message: "Çalışma alanı bulunamadı." };
        }

        const actorMembership = await tx.workspaceUser.findUnique({
          where: {
            workspace_id_user_id: {
              workspace_id: workspaceId,
              user_id: ctx.user.id,
            },
          },
        });
        if (
          !actorMembership ||
          actorMembership.status !== "active"
        ) {
          return {
            kind: "error",
            message: "Üyelik yetkiniz bu sırada değişti. Sayfayı yenileyin.",
          };
        }

        const membership = await tx.workspaceUser.findFirst({
          where: { id: membershipId, workspace_id: workspaceId },
        });
        if (!membership) {
          return { kind: "error", message: "Üyelik bulunamadı." };
        }
        if (
          !assignableRolesFor(actorMembership.role).includes(requestedRole)
        ) {
          return {
            kind: "error",
            message: "Bu rolü atama yetkiniz bulunmuyor.",
          };
        }
        if (
          ["owner", "admin"].includes(membership.role) &&
          actorMembership.role !== "owner"
        ) {
          return {
            kind: "error",
            message: "Sahip veya Yönetici rolündeki bir üyeyi yalnızca Sahip değiştirebilir.",
          };
        }

        if (
          membership.role === "owner" &&
          membership.status === "active" &&
          requestedRole !== "owner"
        ) {
          const activeOwners = await tx.workspaceUser.count({
            where: {
              workspace_id: workspaceId,
              role: "owner",
              status: "active",
            },
          });
          if (activeOwners <= 1) {
            return {
              kind: "error",
              message: "Son aktif Owner rolü değiştirilemez.",
            };
          }
        }

        await tx.workspaceUser.update({
          where: { id: membershipId },
          data: { role: requestedRole },
        });
        return { kind: "ok", previousRole: membership.role };
      }
    );
    if (result.kind === "error") return fail(result.message);

    await writeAudit({
      workspace_id: workspaceId,
      actor_user_id: ctx.user.id,
      action: "CHANGE_ROLE",
      auditable_type: "workspace_user",
      auditable_id: membershipId,
      before_data: { role: result.previousRole },
      after_data: { role: requestedRole },
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
    const ctx = await requirePermission("team.update");
    const workspaceId = ctx.workspaceId;
    if (
      !membershipIdSchema.safeParse(membershipId).success ||
      typeof active !== "boolean"
    ) {
      return fail("Üyelik durumu isteği geçersiz.");
    }
    type StatusChangeResult =
      | { kind: "error"; message: string }
      | { kind: "ok"; previousStatus: "active" | "inactive" };

    const result = await prisma.$transaction(
      async (tx): Promise<StatusChangeResult> => {
        if (!(await lockWorkspaceForOwnerChange(tx, workspaceId))) {
          return { kind: "error", message: "Çalışma alanı bulunamadı." };
        }

        const actorMembership = await tx.workspaceUser.findUnique({
          where: {
            workspace_id_user_id: {
              workspace_id: workspaceId,
              user_id: ctx.user.id,
            },
          },
        });
        if (
          !actorMembership ||
          actorMembership.status !== "active"
        ) {
          return {
            kind: "error",
            message: "Üyelik yetkiniz bu sırada değişti. Sayfayı yenileyin.",
          };
        }

        const membership = await tx.workspaceUser.findFirst({
          where: { id: membershipId, workspace_id: workspaceId },
        });
        if (!membership) {
          return { kind: "error", message: "Üyelik bulunamadı." };
        }
        if (membership.user_id === ctx.user.id && !active) {
          return {
            kind: "error",
            message: "Kendi üyeliğinizi pasifleştiremezsiniz.",
          };
        }
        if (
          ["owner", "admin"].includes(membership.role) &&
          actorMembership.role !== "owner"
        ) {
          return {
            kind: "error",
            message: "Sahip veya Yönetici üyeliğini yalnızca Sahip değiştirebilir.",
          };
        }
        if (
          membership.role === "owner" &&
          membership.status === "active" &&
          !active
        ) {
          const activeOwners = await tx.workspaceUser.count({
            where: {
              workspace_id: workspaceId,
              role: "owner",
              status: "active",
            },
          });
          if (activeOwners <= 1) {
            return {
              kind: "error",
              message: "Son aktif Owner pasifleştirilemez.",
            };
          }
        }

        await tx.workspaceUser.update({
          where: { id: membershipId },
          data: { status: active ? "active" : "inactive" },
        });
        return { kind: "ok", previousStatus: membership.status };
      }
    );
    if (result.kind === "error") return fail(result.message);

    await writeAudit({
      workspace_id: workspaceId,
      actor_user_id: ctx.user.id,
      action: active ? "ACTIVATE_MEMBER" : "DEACTIVATE_MEMBER",
      auditable_type: "workspace_user",
      auditable_id: membershipId,
      before_data: { status: result.previousStatus },
      after_data: { status: active ? "active" : "inactive" },
    });

    revalidatePath("/ekip");
    return ok(null, active ? "Üye aktifleştirildi." : "Üye pasifleştirildi.");
  } catch (error) {
    return handleError(error);
  }
}

/** Kullanıcıyı çalışma alanından kalıcı olarak kaldırır; global hesabı korunur. */
export async function removeMember(
  membershipId: string
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("team.delete");
    if (!membershipIdSchema.safeParse(membershipId).success) {
      return fail("Üyelik kimliği geçersiz.");
    }

    type RemoveResult =
      | { kind: "error"; message: string }
      | { kind: "ok"; userId: string; email: string; role: MembershipRole };

    const result = await prisma.$transaction(async (tx): Promise<RemoveResult> => {
      if (!(await lockWorkspaceForOwnerChange(tx, ctx.workspaceId))) {
        return { kind: "error", message: "Çalışma alanı bulunamadı." };
      }

      const actorMembership = await tx.workspaceUser.findUnique({
        where: {
          workspace_id_user_id: {
            workspace_id: ctx.workspaceId,
            user_id: ctx.user.id,
          },
        },
      });
      if (!actorMembership || actorMembership.status !== "active") {
        return {
          kind: "error",
          message: "Üyelik yetkiniz bu sırada değişti. Sayfayı yenileyin.",
        };
      }

      const membership = await tx.workspaceUser.findFirst({
        where: { id: membershipId, workspace_id: ctx.workspaceId },
        include: { user: { select: { email: true, current_workspace_id: true } } },
      });
      if (!membership) return { kind: "error", message: "Üyelik bulunamadı." };
      if (membership.user_id === ctx.user.id) {
        return { kind: "error", message: "Kendi üyeliğinizi silemezsiniz." };
      }
      if (
        ["owner", "admin"].includes(membership.role) &&
        actorMembership.role !== "owner"
      ) {
        return {
          kind: "error",
          message: "Sahip veya Yönetici üyeliğini yalnızca Sahip silebilir.",
        };
      }
      if (membership.role === "owner" && membership.status === "active") {
        const activeOwners = await tx.workspaceUser.count({
          where: { workspace_id: ctx.workspaceId, role: "owner", status: "active" },
        });
        if (activeOwners <= 1) {
          return { kind: "error", message: "Son aktif Sahip silinemez." };
        }
      }

      await tx.workspaceUser.delete({ where: { id: membership.id } });
      if (membership.user.current_workspace_id === ctx.workspaceId) {
        const fallback = await tx.workspaceUser.findFirst({
          where: {
            user_id: membership.user_id,
            status: "active",
            workspace: { deleted_at: null },
          },
          orderBy: { created_at: "asc" },
          select: { workspace_id: true },
        });
        await tx.user.update({
          where: { id: membership.user_id },
          data: { current_workspace_id: fallback?.workspace_id ?? null },
        });
      }

      return {
        kind: "ok",
        userId: membership.user_id,
        email: membership.user.email,
        role: membership.role,
      };
    });
    if (result.kind === "error") return fail(result.message);

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "REMOVE_MEMBER",
      auditable_type: "workspace_user",
      auditable_id: membershipId,
      before_data: { user_id: result.userId, email: result.email, role: result.role },
    });

    revalidatePath("/ekip");
    return ok(null, "Kullanıcı çalışma alanından silindi.");
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
    const ctx = await requirePermission("workspaces.create");
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

/** Aktif çalışma alanını siler ve kullanıcıları erişilebilir alanlarına taşır. */
export async function deleteWorkspace(
  workspaceId: string
): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("workspaces.delete");
    if (!z.uuid().safeParse(workspaceId).success || workspaceId !== ctx.workspaceId) {
      return fail("Yalnızca aktif çalışma alanı silinebilir.");
    }

    const result = await prisma.$transaction(async (tx) => {
      // Yeni alan oluşturma ile silme aynı anda çalışırsa son alan kontrolünü
      // kullanıcının güncel üyelikleri üzerinden seri hale getir.
      await tx.$queryRaw`
        SELECT id
        FROM users
        WHERE id = ${ctx.user.id}::uuid
        FOR UPDATE
      `;

      const actorFallback = await tx.workspaceUser.findFirst({
        where: {
          user_id: ctx.user.id,
          workspace_id: { not: workspaceId },
          status: "active",
          workspace: { deleted_at: null },
        },
        orderBy: { created_at: "asc" },
        select: { workspace_id: true },
      });
      if (!actorFallback) {
        return {
          kind: "error" as const,
          message:
            "Son aktif çalışma alanınızı silemezsiniz. Önce yeni bir çalışma alanı oluşturun.",
        };
      }

      const workspace = await tx.workspace.findFirst({
        where: { id: workspaceId, deleted_at: null },
        select: { id: true, name: true },
      });
      if (!workspace) {
        return {
          kind: "error" as const,
          message: "Çalışma alanı bulunamadı veya daha önce silinmiş.",
        };
      }

      const affectedUsers = await tx.user.findMany({
        where: { current_workspace_id: workspaceId },
        select: { id: true },
      });
      for (const user of affectedUsers) {
        const fallback = await tx.workspaceUser.findFirst({
          where: {
            user_id: user.id,
            workspace_id: { not: workspaceId },
            status: "active",
            workspace: { deleted_at: null },
          },
          orderBy: { created_at: "asc" },
          select: { workspace_id: true },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { current_workspace_id: fallback?.workspace_id ?? null },
        });
      }

      await tx.workspace.update({
        where: { id: workspaceId },
        data: { deleted_at: new Date() },
      });
      return { kind: "ok" as const, workspace };
    });
    if (result.kind === "error") return fail(result.message);

    await writeAudit({
      workspace_id: workspaceId,
      actor_user_id: ctx.user.id,
      action: "DELETE_WORKSPACE",
      auditable_type: "workspace",
      auditable_id: workspaceId,
      before_data: { name: result.workspace.name, deleted_at: null },
      after_data: { deleted_at: new Date().toISOString() },
    });

    revalidatePath("/", "layout");
    return ok(null, "Çalışma alanı silindi.");
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
    if (isPasswordResetRequired(ctx)) {
      return fail(PASSWORD_RESET_REQUIRED_MESSAGE);
    }

    const membership = await prisma.workspaceUser.findUnique({
      where: {
        workspace_id_user_id: { workspace_id: workspaceId, user_id: ctx.user.id },
      },
      include: { workspace: { select: { deleted_at: true } } },
    });
    if (
      !membership ||
      membership.status !== "active" ||
      membership.workspace.deleted_at
    ) {
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
