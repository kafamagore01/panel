import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/audit";
import { GithubError } from "@/lib/github/client";
import { saveConnection } from "@/lib/github/connection";
import {
  OAUTH_STATE_COOKIE,
  callbackUrl,
  exchangeCodeForToken,
  isOAuthConfigured,
  statesMatch,
} from "@/lib/github/oauth";

/**
 * OAuth dönüş adresi. State çerezi doğrulanır, authorization code token'a
 * çevrilir ve bağlantı şifreli olarak kaydedilir. Her sonuç /ayarlar sayfasına
 * `?github=` durum koduyla döner.
 */
export async function GET(request: NextRequest) {
  const settings = new URL("/ayarlar", request.url);
  const done = (status: string) => {
    settings.searchParams.set("github", status);
    const response = NextResponse.redirect(settings);
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  };

  const ctx = await getAuthContext();
  if (!ctx?.workspaceId || !hasPermission(ctx.role, "system.manage")) {
    return done("forbidden");
  }
  if (!isOAuthConfigured()) return done("oauth_disabled");

  const params = request.nextUrl.searchParams;
  // Kullanıcı GitHub ekranında "Cancel" derse error parametresiyle döner.
  if (params.get("error")) return done("cancelled");

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || !statesMatch(state, expectedState)) {
    return done("state_mismatch");
  }

  try {
    const { access_token, scope } = await exchangeCodeForToken(
      code,
      callbackUrl(request.nextUrl.origin)
    );

    const viewer = await saveConnection({
      workspaceId: ctx.workspaceId,
      userId: ctx.user.id,
      token: access_token,
      authType: "oauth",
      scopes: scope,
    });

    await writeAudit({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.user.id,
      action: "GITHUB_CONNECT",
      auditable_type: "github_connection",
      auditable_id: ctx.workspaceId,
      after_data: { auth_type: "oauth", account_login: viewer.login, scopes: scope },
    });

    return done("connected");
  } catch (error) {
    if (!(error instanceof GithubError)) console.error(error);
    return done("failed");
  }
}
