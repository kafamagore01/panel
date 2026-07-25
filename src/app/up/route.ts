import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Dış izleme/deploy sağlık kontrolü. Panel içi site durumu için /api/site-durumu kullanılır. */
export function GET() {
  return NextResponse.json(
    { status: "ok", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
