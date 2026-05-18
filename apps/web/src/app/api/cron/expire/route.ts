import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { captureException } from "@/lib/observability";
import { expireUnpaidBookings, releaseExpiredHolds } from "@/features/booking/service";
import { expirePendingSignups } from "@/features/open-play";

/**
 * Cron route — runs every minute via Vercel Cron (see vercel.json).
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}` OR Vercel's own
 * `x-vercel-cron` header (set automatically when invoked by the platform).
 *
 * Idempotent. Safe to retry. Each operation handles its own concurrency.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;
  // Vercel's cron invokes also set this header.
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
    const [holds, bookings, openPlaySignups] = await Promise.all([
      releaseExpiredHolds(),
      expireUnpaidBookings(),
      expirePendingSignups(),
    ]);
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      holds,
      bookings,
      openPlaySignups,
    });
  } catch (err) {
    captureException(err, { scope: "cron.expire" });
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
}

// Allow manual POST trigger from internal tooling for emergencies.
export const POST = GET;
