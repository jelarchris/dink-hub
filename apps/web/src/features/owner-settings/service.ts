import "server-only";
import { sendEmail } from "@/lib/email/send";
import { ownerDailyDigestEmail } from "@/lib/email/templates";
import { captureException } from "@/lib/observability";
import * as repo from "./repo";
import { notificationPrefsSchema } from "./schema";
import type { NotificationPrefs } from "./types";

export type { NotificationPrefs };

export async function getOwnerNotificationPrefs(
  ownerId: string,
): Promise<NotificationPrefs | null> {
  return repo.getNotificationPrefs(ownerId);
}

export async function updateOwnerNotificationPrefs(
  ownerId: string,
  raw: unknown,
): Promise<void> {
  const prefs = notificationPrefsSchema.parse(raw);
  await repo.updateNotificationPrefs(ownerId, prefs);
}

/**
 * Runs the daily digest for all opted-in venue owners.
 *
 * Manila is fixed UTC+8 — we compute the current Manila calendar day as a UTC
 * window without relying on any system locale. The digest only sends when an
 * owner has something to report (≥1 new booking or ≥1 pending receipt).
 *
 * Idempotent: calling twice on the same day just sends a duplicate — callers
 * should use a cron with concurrency: cancel-in-progress: false.
 */
export async function runDailyDigest(): Promise<{ sent: number; failed: number }> {
  const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

  const now = new Date();
  // Shift to Manila wall clock to get today's calendar date
  const manilaNow = new Date(now.getTime() + MANILA_OFFSET_MS);
  const manilaToday = new Date(
    Date.UTC(manilaNow.getUTCFullYear(), manilaNow.getUTCMonth(), manilaNow.getUTCDate()),
  );
  // Shift back to UTC for DB queries
  const dayStartUtc = new Date(manilaToday.getTime() - MANILA_OFFSET_MS);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);

  const owners = await repo.getDigestOwners();

  let sent = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    owners.map(async (owner) => {
      const stats = await repo.getDigestStatsForOwner(
        owner.ownerId,
        dayStartUtc,
        dayEndUtc,
      );

      // Skip email if there's nothing actionable to show.
      if (stats.newBookingsToday === 0 && stats.pendingReceiptsCount === 0) return;

      const tpl = ownerDailyDigestEmail({
        ownerDisplayName: owner.displayName,
        newBookingsToday: stats.newBookingsToday,
        pendingReceiptsCount: stats.pendingReceiptsCount,
        todayRevenueCentavos: stats.todayRevenueCentavos,
        digestDate: dayStartUtc,
      });

      await sendEmail({ to: owner.email, ...tpl, tag: "daily_digest" });
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      sent++;
    } else {
      failed++;
      captureException(r.reason, { scope: "cron.daily_digest.owner" });
    }
  }

  return { sent, failed };
}
