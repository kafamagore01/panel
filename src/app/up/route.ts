import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Basit sağlık kontrolü — üst bardaki canlı sistem durumu göstergesi buraya ping atar. */
export function GET() {
  return NextResponse.json(
    { status: "ok", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
