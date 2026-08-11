import { NextResponse, type NextRequest } from "next/server";
import {
  getAuthContext,
  isPasswordResetRequired,
} from "@/lib/auth/context";
import { hasWorkspacePermission } from "@/lib/auth/permissions";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  buildAuthorizeUrl,
  callbackUrl,
  createState,
  isOAuthConfigured,
} from "@/lib/github/oauth";

/**
 * OAuth akışının başlangıcı: CSRF state çerezi yazılır ve kullanıcı GitHub'ın
 * yetkilendirme ekranına yönlendirilir. Oturum kontrolü proxy katmanında,
 * rol kontrolü burada yapılır.
 */
export async function GET(request: NextRequest) {
  const settings = new URL("/ayarlar", request.url);

  const ctx = await getAuthContext();
  if (isPasswordResetRequired(ctx)) {
    settings.searchParams.set("github", "password_reset_required");
    return NextResponse.redirect(settings);
  }
  if (!(await hasWorkspacePermission(ctx?.workspaceId ?? null, ctx?.role ?? null, "settings.update"))) {
    settings.searchParams.set("github", "forbidden");
    return NextResponse.redirect(settings);
  }

  if (!isOAuthConfigured()) {
    settings.searchParams.set("github", "oauth_disabled");
    return NextResponse.redirect(settings);
  }

  const state = createState();
  const response = NextResponse.redirect(
    buildAuthorizeUrl(state, callbackUrl(request.nextUrl.origin))
  );

  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: "/",
  });

  return response;
}
