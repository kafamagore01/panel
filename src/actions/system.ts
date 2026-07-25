"use server";

import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { assertSafeWebhookUrl, SsrfError } from "@/lib/security/ssrf-guard";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type ActionResponse } from "@/lib/action-response";

/** Manuel deployment tetikleme (yalnızca Owner). DEPLOY_HOOK_URL çağrılır. */
export async function triggerDeployment(): Promise<ActionResponse<null>> {
  try {
    const ctx = await requirePermission("system.manage");

    const hookUrl = process.env.DEPLOY_HOOK_URL;
    if (!hookUrl) {
      return fail("Deployment kancası (DEPLOY_HOOK_URL) yapılandırılmamış.");
    }

    // SSRF koruması: iç ağ adreslerine tetikleme engellenir
    try {
      await assertSafeWebhookUrl(hookUrl);
    } catch (error) {
      if (error instanceof SsrfError) return fail(error.message);
      throw error;
    }

    const res = await fetch(hookUrl, { method: "POST" });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "TRIGGER_DEPLOY",
      auditable_type: "system",
      after_data: { http_status: res.status },
    });

    if (!res.ok) {
      return fail(`Deployment tetiklenemedi (HTTP ${res.status}).`);
    }
    return ok(null, "Deployment tetiklendi.");
  } catch (error) {
    if (error instanceof PermissionError) return fail(error.message);
    console.error(error);
    return fail("Deployment tetiklenirken hata oluştu.");
  }
}
