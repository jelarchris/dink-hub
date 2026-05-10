import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * One-shot Sentry verification endpoint. Captures a synthetic exception
 * server-side and returns the event id. Safe to leave live: the only side
 * effect is one Sentry event per call. Remove or guard once verified.
 */
export async function GET(): Promise<NextResponse> {
  const eventId = Sentry.captureException(
    new Error("dinkhub sentry verification — safe to ignore"),
  );
  await Sentry.flush(2000);
  return NextResponse.json({ ok: true, eventId });
}
