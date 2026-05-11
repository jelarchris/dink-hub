import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { captureException } from "@/lib/observability";
import { runDailyDigest } from "@/features/owner-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;
  if (req.headers.get("x-vercel-cron")) {
    const tokenHeader = req.headers.get("x-cron-secret");
    if (tokenHeader && tokenHeader === expected) return true;
  }
  return false;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    const result = await runDailyDigest();
    return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
  } catch (err) {
    captureException(err, { scope: "cron.daily_digest" });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export const POST = GET;
