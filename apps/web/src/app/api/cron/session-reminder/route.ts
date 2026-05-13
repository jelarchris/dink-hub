import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { captureException } from "@/lib/observability";
import { sendSessionReminders } from "@/features/booking/service";

/**
 * Cron route — runs every 30 minutes via GitHub Actions.
 *
 * Finds confirmed bookings whose session starts in the next 1h45m–2h15m
 * and dispatches a "your game is in 2 hours" email to each player.
 * Safe to retry: reminder_sent_at is stamped before email dispatch.
 */
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
    const result = await sendSessionReminders();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  } catch (err) {
    captureException(err, { scope: "cron.session_reminder" });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

// Allow manual POST trigger for emergencies.
export const POST = GET;
