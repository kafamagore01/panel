import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/queue/verify";
import { runBillingCron } from "@/lib/cron/billing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Yinelenen faturalandırma cron'u (QStash Schedule veya CRON_SECRET ile korunur). */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const authorized = await authorizeCron(
    req.headers.get("upstash-signature"),
    body,
    req.headers.get("authorization")
  );
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runBillingCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Billing cron hatası:", error);
    return NextResponse.json({ error: "cron_failed" }, { status: 500 });
  }
}
