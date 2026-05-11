import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { captureException } from "@/lib/observability";
import { computePriorWeekPeriod, generateWeeklyInvoices } from "@/features/owner-invoices";
import { notifyOwnerInvoiceIssued } from "@/features/owner-invoices/notifications";

/**
 * Cron route — runs every Monday 06:00 Manila (= 22:00 UTC Sunday) via the
 * GitHub Actions workflow `.github/workflows/cron-weekly-invoices.yml`.
 *
 * Computes the prior Mon–Sun period (Asia/Manila wall-clock) and generates
 * one invoice per venue with non-zero booking fees. Idempotent: a re-run for
 * the same period is a no-op (UNIQUE (venue_id, period_start) constraint).
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
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

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    const period = computePriorWeekPeriod(new Date());
    const result = await generateWeeklyInvoices(period);

    // Notify each newly-issued invoice owner. notifyOwnerInvoiceIssued never
    // throws — errors are captured to Sentry internally. We run them in
    // parallel since each is an independent email dispatch.
    if (result.createdInvoiceIds.length > 0) {
      await Promise.all(result.createdInvoiceIds.map((id) => notifyOwnerInvoiceIssued(id)));
    }

    return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
  } catch (err) {
    captureException(err, { scope: "cron.weekly-invoices" });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export const GET = POST;
