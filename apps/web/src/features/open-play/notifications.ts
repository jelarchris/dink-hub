import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  courts,
  openPlaySessions,
  openPlaySignupPayments,
  openPlaySignups,
  profiles,
  venues,
} from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import {
  openPlayCancelledByOwnerEmail,
  openPlayJoinConfirmedEmail,
  openPlayJoinPendingEmail,
  openPlayOwnerNudgeReceiptStaleEmail,
  openPlayOwnerNudgeReceiptUrgentEmail,
  openPlaySessionReminderEmail,
  openPlaySignupAutoConfirmedEmail,
  openPlaySignupLateConfirmedEmail,
  openPlaySignupPaymentSubmittedEmail,
} from "@/lib/email/templates";
import { captureException } from "@/lib/observability";

/**
 * Open-play notifications. Side-effect only — never throws to caller.
 * Each function loads the rows it needs, then dispatches the email. Failures
 * are captured to Sentry; the action flow is unaffected.
 */

interface SignupJoin {
  sessionId: string;
  signupId: string;
  sessionTitle: string;
  startAt: Date;
  endAt: Date;
  capacity: number;
  pricePerPlayerCentavos: bigint;
  totalCentavos: bigint;
  courtName: string;
  venueName: string;
  ownerEmail: string;
  ownerDisplayName: string;
  playerEmail: string;
  playerDisplayName: string;
  gcashReferenceNumber: string | null;
}

async function loadSignupJoin(signupId: string): Promise<SignupJoin | null> {
  const rows = await db
    .select({
      sessionId: openPlaySessions.id,
      signupId: openPlaySignups.id,
      sessionTitle: openPlaySessions.title,
      startAt: openPlaySessions.startAt,
      endAt: openPlaySessions.endAt,
      capacity: openPlaySessions.capacity,
      pricePerPlayerCentavos: openPlaySessions.pricePerPlayerCentavos,
      totalCentavos: openPlaySignups.totalCentavos,
      courtName: courts.name,
      venueName: venues.name,
      ownerId: venues.ownerId,
      playerId: openPlaySignups.playerId,
      contactEmail: openPlaySignups.contactEmail,
    })
    .from(openPlaySignups)
    .innerJoin(openPlaySessions, eq(openPlaySessions.id, openPlaySignups.sessionId))
    .innerJoin(courts, eq(courts.id, openPlaySessions.courtId))
    .innerJoin(venues, eq(venues.id, openPlaySessions.venueId))
    .where(eq(openPlaySignups.id, signupId))
    .limit(1);
  const base = rows[0];
  if (!base) return null;

  const [owner] = await db
    .select({ email: profiles.email, displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, base.ownerId))
    .limit(1);
  const [player] = await db
    .select({ email: profiles.email, displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, base.playerId))
    .limit(1);
  if (!owner || !player) return null;

  const [paymentRow] = await db
    .select({ ref: openPlaySignupPayments.gcashReferenceNumber })
    .from(openPlaySignupPayments)
    .where(eq(openPlaySignupPayments.signupId, signupId))
    .orderBy(openPlaySignupPayments.submittedAt)
    .limit(1);

  return {
    sessionId: base.sessionId,
    signupId: base.signupId,
    sessionTitle: base.sessionTitle,
    startAt: base.startAt,
    endAt: base.endAt,
    capacity: base.capacity,
    pricePerPlayerCentavos: base.pricePerPlayerCentavos,
    totalCentavos: base.totalCentavos,
    courtName: base.courtName,
    venueName: base.venueName,
    ownerEmail: owner.email,
    ownerDisplayName: owner.displayName,
    playerEmail: base.contactEmail ?? player.email,
    playerDisplayName: player.displayName,
    gcashReferenceNumber: paymentRow?.ref ?? null,
  };
}

export async function notifyOpenPlayJoinPending(signupId: string): Promise<void> {
  try {
    const ctx = await loadSignupJoin(signupId);
    if (!ctx) return;
    const tpl = openPlayJoinPendingEmail(ctx);
    await sendEmail({ to: ctx.playerEmail, ...tpl, tag: "open_play_join_pending" });
  } catch (err) {
    captureException(err, { scope: "open-play.notifyJoinPending", extra: { signupId } });
  }
}

export async function notifyOpenPlayJoinConfirmed(signupId: string): Promise<void> {
  try {
    const ctx = await loadSignupJoin(signupId);
    if (!ctx) return;
    const tpl = openPlayJoinConfirmedEmail(ctx);
    await sendEmail({ to: ctx.playerEmail, ...tpl, tag: "open_play_join_confirmed" });
  } catch (err) {
    captureException(err, { scope: "open-play.notifyJoinConfirmed", extra: { signupId } });
  }
}

export async function notifyOpenPlaySignupPaymentSubmitted(signupId: string): Promise<void> {
  try {
    const ctx = await loadSignupJoin(signupId);
    if (!ctx) return;
    const tpl = openPlaySignupPaymentSubmittedEmail(ctx);
    await sendEmail({ to: ctx.ownerEmail, ...tpl, tag: "open_play_payment_submitted" });
  } catch (err) {
    captureException(err, { scope: "open-play.notifyPaymentSubmitted", extra: { signupId } });
  }
}

export async function notifyOpenPlaySessionReminder(signupId: string): Promise<void> {
  try {
    const ctx = await loadSignupJoin(signupId);
    if (!ctx) return;
    const tpl = openPlaySessionReminderEmail(ctx);
    await sendEmail({ to: ctx.playerEmail, ...tpl, tag: "open_play_reminder" });
  } catch (err) {
    captureException(err, { scope: "open-play.notifyReminder", extra: { signupId } });
  }
}

/**
 * Owner cancelled the whole session — notify every signup whose payment was
 * already verified or submitted (no point spamming pending/expired ones).
 */
export async function notifyOpenPlayCancelledByOwner(args: {
  sessionId: string;
  signupIds: readonly string[];
  reason: string;
}): Promise<void> {
  for (const signupId of args.signupIds) {
    try {
      const ctx = await loadSignupJoin(signupId);
      if (!ctx) continue;
      const tpl = openPlayCancelledByOwnerEmail({ ...ctx, reason: args.reason });
      await sendEmail({ to: ctx.playerEmail, ...tpl, tag: "open_play_cancelled_owner" });
    } catch (err) {
      captureException(err, {
        scope: "open-play.notifyCancelledByOwner",
        extra: { signupId },
      });
    }
  }
}

/**
 * Polite nudge to the venue owner: open-play signup receipt has been awaiting
 * verification for 2 hours. Mirrors booking-side notifyOwnerNudge1.
 */
export async function notifyOwnerSignupNudge1(signupId: string): Promise<void> {
  try {
    const ctx = await loadSignupJoin(signupId);
    if (!ctx) return;
    const tpl = openPlayOwnerNudgeReceiptStaleEmail(ctx);
    await sendEmail({ to: ctx.ownerEmail, ...tpl, tag: "open_play_owner_nudge_1" });
  } catch (err) {
    captureException(err, {
      scope: "open-play.notifyOwnerNudge1",
      extra: { signupId },
    });
  }
}

/**
 * Urgent nudge: session starts in <2h, receipt still unverified.
 */
export async function notifyOwnerSignupNudge2(signupId: string): Promise<void> {
  try {
    const ctx = await loadSignupJoin(signupId);
    if (!ctx) return;
    const tpl = openPlayOwnerNudgeReceiptUrgentEmail(ctx);
    await sendEmail({ to: ctx.ownerEmail, ...tpl, tag: "open_play_owner_nudge_2" });
  } catch (err) {
    captureException(err, {
      scope: "open-play.notifyOwnerNudge2",
      extra: { signupId },
    });
  }
}

/**
 * Signup was auto-confirmed by the SLA cron. Both parties are notified
 * unconditionally — this is a state change, not a marketing nudge.
 */
export async function notifyOpenPlaySignupAutoConfirmed(signupId: string): Promise<void> {
  try {
    const ctx = await loadSignupJoin(signupId);
    if (!ctx) return;
    const playerTpl = openPlaySignupAutoConfirmedEmail({
      ...ctx,
      recipientDisplayName: ctx.playerDisplayName,
      audience: "player",
    });
    const ownerTpl = openPlaySignupAutoConfirmedEmail({
      ...ctx,
      recipientDisplayName: ctx.ownerDisplayName,
      audience: "owner",
    });
    await Promise.all([
      sendEmail({ to: ctx.playerEmail, ...playerTpl, tag: "open_play_signup_auto_confirmed" }),
      sendEmail({ to: ctx.ownerEmail, ...ownerTpl, tag: "open_play_signup_auto_confirmed" }),
    ]);
  } catch (err) {
    captureException(err, {
      scope: "open-play.notifyAutoConfirmed",
      extra: { signupId },
    });
  }
}

/**
 * Signup was late-confirmed by an admin after the session window ended.
 * Both parties receive the audit notice unconditionally.
 */
export async function notifyOpenPlaySignupLateConfirmed(
  signupId: string,
  reason: string,
): Promise<void> {
  try {
    const ctx = await loadSignupJoin(signupId);
    if (!ctx) return;
    const playerTpl = openPlaySignupLateConfirmedEmail({
      ...ctx,
      recipientDisplayName: ctx.playerDisplayName,
      audience: "player",
      reason,
    });
    const ownerTpl = openPlaySignupLateConfirmedEmail({
      ...ctx,
      recipientDisplayName: ctx.ownerDisplayName,
      audience: "owner",
      reason,
    });
    await Promise.all([
      sendEmail({ to: ctx.playerEmail, ...playerTpl, tag: "open_play_signup_late_confirmed" }),
      sendEmail({ to: ctx.ownerEmail, ...ownerTpl, tag: "open_play_signup_late_confirmed" }),
    ]);
  } catch (err) {
    captureException(err, {
      scope: "open-play.notifyLateConfirmed",
      extra: { signupId },
    });
  }
}
