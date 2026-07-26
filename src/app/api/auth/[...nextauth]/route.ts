import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { logError } from "@/lib/logger";

export const GET = handlers.GET;

/**
 * Auth.js'in doğrudan signout endpoint'inde cookie silinmeden önce DB tokenını
 * iptal eder. DB yazımı başarısızsa logout fail-closed kalır ve istemciye 503
 * döner; böylece cookie kaybolup sunucuda yeniden kullanılabilir token kalmaz.
 */
export async function POST(request: NextRequest) {
  if (request.nextUrl.pathname.endsWith("/signout")) {
    const sessionToken =
      request.cookies.get("authjs.session-token")?.value ??
      request.cookies.get("__Secure-authjs.session-token")?.value;
    if (sessionToken) {
      try {
        await prisma.session.deleteMany({
          where: { session_token: sessionToken },
        });
      } catch (error) {
        logError("auth.session_revocation_failed", error);
        return NextResponse.json(
          { error: "session_revocation_failed" },
          { status: 503 }
        );
      }
    }
  }
  return handlers.POST(request);
}
