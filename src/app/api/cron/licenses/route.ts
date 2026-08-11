import { NextResponse, type NextRequest } from "next/server";
import { runLicenseCron } from "@/lib/cron/licenses";
import { authorizeCron } from "@/lib/queue/verify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleCron(req: NextRequest, body: string) {
  const authorized = await authorizeCron(
    req.headers.get("upstash-signature"),
    body,
    req.headers.get("authorization")
  );
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLicenseCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("License cron hatası:", error);
    return NextResponse.json({ error: "cron_failed" }, { status: 500 });
  }
}

/** Vercel Cron GET, QStash Schedule ise imzalı POST kullanabilir. */
export async function GET(req: NextRequest) {
  return handleCron(req, "");
}

export async function POST(req: NextRequest) {
  return handleCron(req, await req.text());
}
