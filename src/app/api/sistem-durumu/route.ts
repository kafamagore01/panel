import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { getUptimeReport } from "@/lib/uptime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Üst bardaki durum göstergesinin veri kaynağı. Oturum ve aktif çalışma alanı zorunludur. */
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx?.workspaceId) {
    return NextResponse.json(
      { error: "Bu bilgiye erişim yetkiniz yok." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const force = request.nextUrl.searchParams.get("yenile") === "1";

  try {
    const report = await getUptimeReport(ctx.workspaceId, { force });
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Sistem durumu kontrolü başarısız:", error);
    return NextResponse.json(
      { error: "Sistem durumu alınamadı." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
