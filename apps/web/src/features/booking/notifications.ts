import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, courts, payments, profiles, venues } from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import {
  bookingCancelledByPlayerEmail,
  bookingForceCancelledEmail,
  bookingRescheduledByOwnerEmail,
  buildRescheduleIcs,
  disputeOpenedEmail,
  disputeResolvedEmail,
  paymentRejectedEmail,
  paymentSubmittedEmail,
  paymentVerifiedEmail,
  sessionReminderEmail,
} from "@/lib/email/templates";
import { captureException } from "@/lib/observability";

/**
 * Booking notifications. Side-effect-only \u2014 never throws to caller.
 *
 * Each function takes the minimal id it needs, joins the related rows in one
 * query, then dispatches the email. Failures are captured to Sentry but the
 * caller's flow is unaffected (email \u2260 business path).
 */

interface BookingJoin {
  bookingId: string;
  startAt: Date;
  endAt: Date;
  totalCentavos: bigint;
  paymentMode: string;
  balanceDueCentavos: bigint;
  balanceCollectedAt: Date | null;
  rescheduledCount: number;
  cancellationCategory:
    | "weather"
    | "court_unavailable"
    | "venue_closure"
    | "player_request"
    | "admin_action"
    | "other"
    | null;
  courtName: string;
  venueName: string;
  venueSlug: string;
  ownerEmail: string;
  ownerDisplayName: string;
  ownerNotificationPrefs: {
    email_on_payment_submitted: boolean;
    email_on_booking_cancelled: boolean;
    email_daily_digest: boolean;
  };
  playerEmail: string;
  playerDisplayName: string;
  gcashReferenceNumber: string | null;
}

async function loadBookingJoin(bookingId: string): Promise<BookingJoin | null> {
  const baseRows = await db
    .select({
      bookingId: bookings.id,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      totalCentavos: bookings.totalCentavos,
      paymentMode: bookings.paymentMode,
      balanceDueCentavos: bookings.balanceDueCentavos,
      balanceCollectedAt: bookings.balanceCollectedAt,
      rescheduledCount: bookings.rescheduledCount,
      cancellationCategory: bookings.cancellationCategory,
      playerId: bookings.playerId,
      contactEmail: bookings.contactEmail,
      courtName: courts.name,
      venueName: venues.name,
      venueSlug: venues.slug,
      ownerId: venues.ownerId,
    })
    .from(bookings)
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .innerJoin(venues, eq(venues.id, courts.venueId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  const base = baseRows[0];
  if (!base) return null;

  const [ownerRow] = await db
    .select({
      email: profiles.email,
      displayName: profiles.displayName,
      notificationPrefs: profiles.notificationPrefs,
    })
    .from(profiles)
    .where(eq(profiles.id, base.ownerId))
    .limit(1);
  const [playerRow] = await db
    .select({ email: profiles.email, displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, base.playerId))
    .limit(1);
  if (!ownerRow || !playerRow) return null;

  // Latest payment carries the GCash ref (nullable for receipt-only flows).
  const [paymentRow] = await db
    .select({ ref: payments.gcashReferenceNumber })
    .from(payments)
    .where(eq(payments.bookingId, bookingId))
    .orderBy(payments.submittedAt)
    .limit(1);

  return {
    bookingId: base.bookingId,
    startAt: base.startAt,
    endAt: base.endAt,
    totalCentavos: base.totalCentavos,
    paymentMode: base.paymentMode,
    balanceDueCentavos: base.balanceDueCentavos,
    balanceCollectedAt: base.balanceCollectedAt,
    rescheduledCount: base.rescheduledCount,
    cancellationCategory: base.cancellationCategory,
    courtName: base.courtName,
    venueName: base.venueName,
    venueSlug: base.venueSlug,
    ownerEmail: ownerRow.email,
    ownerDisplayName: ownerRow.displayName,
    ownerNotificationPrefs: ownerRow.notificationPrefs,
    // Prefer the per-booking override entered on the booking modal; fall back
    // to the account email when the player didn't override it.
    playerEmail: base.contactEmail ?? playerRow.email,
    playerDisplayName: playerRow.displayName,
    gcashReferenceNumber: paymentRow?.ref ?? null,
  };
}

export async function notifyPaymentSubmitted(bookingId: string): Promise<void> {
  try {
    const ctx = await loadBookingJoin(bookingId);
    if (!ctx) return;
    if (!ctx.ownerNotificationPrefs.email_on_payment_submitted) return;
    const tpl = paymentSubmittedEmail({
      bookingId: ctx.bookingId,
      venueName: ctx.venueName,
      courtName: ctx.courtName,
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      totalCentavos: ctx.totalCentavos,
      ownerDisplayName: ctx.ownerDisplayName,
      playerDisplayName: ctx.playerDisplayName,
      gcashReferenceNumber: ctx.gcashReferenceNumber,
    });
    await sendEmail({ to: ctx.ownerEmail, ...tpl, tag: "payment_submitted" });
  } catch (err) {
    captureException(err, { scope: "notify.payment_submitted", extra: { bookingId } });
  }
}

export async function notifyPaymentVerified(bookingId: string): Promise<void> {
  try {
    const ctx = await loadBookingJoin(bookingId);
    if (!ctx) return;
    const tpl = paymentVerifiedEmail({
      bookingId: ctx.bookingId,
      venueName: ctx.venueName,
      courtName: ctx.courtName,
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      totalCentavos: ctx.totalCentavos,
      playerDisplayName: ctx.playerDisplayName,
      ...(ctx.paymentMode === "deposit" && ctx.balanceCollectedAt === null
        ? { balanceDueCentavos: ctx.balanceDueCentavos }
        : {}),
    });
    await sendEmail({ to: ctx.playerEmail, ...tpl, tag: "payment_verified" });
  } catch (err) {
    captureException(err, { scope: "notify.payment_verified", extra: { bookingId } });
  }
}

export async function notifyPaymentRejected(bookingId: string, reason: string): Promise<void> {
  try {
    const ctx = await loadBookingJoin(bookingId);
    if (!ctx) return;
    const tpl = paymentRejectedEmail({
      bookingId: ctx.bookingId,
      venueName: ctx.venueName,
      courtName: ctx.courtName,
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      totalCentavos: ctx.totalCentavos,
      playerDisplayName: ctx.playerDisplayName,
      reason,
    });
    await sendEmail({ to: ctx.playerEmail, ...tpl, tag: "payment_rejected" });
  } catch (err) {
    captureException(err, { scope: "notify.payment_rejected", extra: { bookingId } });
  }
}

export async function notifyBookingCancelledByPlayer(bookingId: string): Promise<void> {
  try {
    const ctx = await loadBookingJoin(bookingId);
    if (!ctx) return;
    if (!ctx.ownerNotificationPrefs.email_on_booking_cancelled) return;
    const tpl = bookingCancelledByPlayerEmail({
      bookingId: ctx.bookingId,
      venueName: ctx.venueName,
      courtName: ctx.courtName,
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      totalCentavos: ctx.totalCentavos,
      ownerDisplayName: ctx.ownerDisplayName,
      playerDisplayName: ctx.playerDisplayName,
    });
    await sendEmail({ to: ctx.ownerEmail, ...tpl, tag: "booking_cancelled_by_player" });
  } catch (err) {
    captureException(err, { scope: "notify.booking_cancelled_by_player", extra: { bookingId } });
  }
}

export async function notifyBookingForceCancelled(bookingId: string, reason: string): Promise<void> {
  try {
    const ctx = await loadBookingJoin(bookingId);
    if (!ctx) return;
    const tpl = bookingForceCancelledEmail({
      bookingId: ctx.bookingId,
      venueName: ctx.venueName,
      courtName: ctx.courtName,
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      totalCentavos: ctx.totalCentavos,
      playerDisplayName: ctx.playerDisplayName,
      reason,
    });
    await sendEmail({ to: ctx.playerEmail, ...tpl, tag: "booking_force_cancelled" });
  } catch (err) {
    captureException(err, { scope: "notify.booking_force_cancelled", extra: { bookingId } });
  }
}

/**
 * Owner-initiated cancel notification. Reuses the force-cancelled template
 * (player-facing copy is suitably generic) but tags the email distinctly so
 * deliverability + analytics can split owner-cancel vs admin-cancel.
 *
 * Future: dedicated template that includes venue contact + refund timeline
 * once admin refund SLA is formalised.
 */
export async function notifyBookingCancelledByOwner(bookingId: string, reason: string): Promise<void> {
  try {
    const ctx = await loadBookingJoin(bookingId);
    if (!ctx) return;
    const isFreeRebookable =
      ctx.cancellationCategory !== null &&
      (ctx.cancellationCategory === "venue_closure" ||
        ctx.cancellationCategory === "weather" ||
        ctx.cancellationCategory === "court_unavailable");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dinkhub.ph";
    const rebookUrl = isFreeRebookable
      ? `${appUrl}/venues/${ctx.venueSlug}/book?rebook=${ctx.bookingId}`
      : undefined;
    const tpl = bookingForceCancelledEmail({
      bookingId: ctx.bookingId,
      venueName: ctx.venueName,
      courtName: ctx.courtName,
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      totalCentavos: ctx.totalCentavos,
      playerDisplayName: ctx.playerDisplayName,
      reason,
      ...(rebookUrl ? { rebookUrl } : {}),
    });
    await sendEmail({ to: ctx.playerEmail, ...tpl, tag: "booking_cancelled_by_owner" });
  } catch (err) {
    captureException(err, { scope: "notify.booking_cancelled_by_owner", extra: { bookingId } });
  }
}

/**
 * Owner-initiated reschedule notification. Sends a styled HTML email to the
 * player with a .ics calendar invite so they can update their calendar app.
 * The ICS UID is stable (booking ID) so repeated reschedules replace the
 * existing calendar event rather than creating duplicates.
 */
export async function notifyBookingRescheduledByOwner(
  bookingId: string,
  oldStartAt: Date,
  oldEndAt: Date,
  reason?: string | null,
  oldCourtName?: string | null,
): Promise<void> {
  try {
    const ctx = await loadBookingJoin(bookingId);
    if (!ctx) return;
    const tpl = bookingRescheduledByOwnerEmail({
      bookingId: ctx.bookingId,
      venueName: ctx.venueName,
      courtName: ctx.courtName,
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      totalCentavos: ctx.totalCentavos,
      playerDisplayName: ctx.playerDisplayName,
      oldStartAt,
      oldEndAt,
      ...(oldCourtName ? { oldCourtName } : {}),
      ...(reason ? { reason } : {}),
    });
    const icsContent = buildRescheduleIcs({
      bookingId: ctx.bookingId,
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      venueName: ctx.venueName,
      courtName: ctx.courtName,
      rescheduledCount: ctx.rescheduledCount,
    });
    await sendEmail({
      to: ctx.playerEmail,
      ...tpl,
      tag: "booking_rescheduled_by_owner",
      attachments: [{ filename: "booking.ics", content: icsContent }],
    });
  } catch (err) {
    captureException(err, { scope: "notify.booking_rescheduled_by_owner", extra: { bookingId } });
  }
}

/**
 * Player notification for the auto-move case: same time, different court.
 * Reuses the rescheduled-by-owner email with `oldCourtName` set so the
 * template switches to "Court change" wording. ICS update replaces the prior
 * calendar event (stable UID = booking ID).
 */
export async function notifyBookingAutoMoved(
  newBookingId: string,
  oldCourtName: string,
  oldStartAt: Date,
  oldEndAt: Date,
  reason: string,
): Promise<void> {
  await notifyBookingRescheduledByOwner(newBookingId, oldStartAt, oldEndAt, reason, oldCourtName);
}

async function bookingIdFromPaymentId(paymentId: string): Promise<string | null> {
  const rows = await db
    .select({ bookingId: payments.bookingId })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  return rows[0]?.bookingId ?? null;
}

export async function notifyDisputeOpened(paymentId: string, reason: string): Promise<void> {
  try {
    const bookingId = await bookingIdFromPaymentId(paymentId);
    if (!bookingId) return;
    const ctx = await loadBookingJoin(bookingId);
    if (!ctx) return;
    const tpl = disputeOpenedEmail({
      bookingId: ctx.bookingId,
      venueName: ctx.venueName,
      courtName: ctx.courtName,
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      totalCentavos: ctx.totalCentavos,
      playerDisplayName: ctx.playerDisplayName,
      reason,
    });
    await sendEmail({ to: ctx.playerEmail, ...tpl, tag: "dispute_opened" });
  } catch (err) {
    captureException(err, { scope: "notify.dispute_opened", extra: { paymentId } });
  }
}

export async function notifyDisputeResolved(
  paymentId: string,
  resolution: "refund_full" | "rejected",
  notes?: string | null,
): Promise<void> {
  try {
    const bookingId = await bookingIdFromPaymentId(paymentId);
    if (!bookingId) return;
    const ctx = await loadBookingJoin(bookingId);
    if (!ctx) return;
    const tpl = disputeResolvedEmail({
      bookingId: ctx.bookingId,
      venueName: ctx.venueName,
      courtName: ctx.courtName,
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      totalCentavos: ctx.totalCentavos,
      playerDisplayName: ctx.playerDisplayName,
      resolution,
      notes: notes ?? null,
    });
    await sendEmail({ to: ctx.playerEmail, ...tpl, tag: "dispute_resolved" });
  } catch (err) {
    captureException(err, { scope: "notify.dispute_resolved", extra: { paymentId } });
  }
}

/**
 * Sends the T-2h session reminder to the player for a confirmed booking.
 * Called by the session-reminder cron; failures are swallowed so the cron
 * can mark reminder_sent_at and move on without retrying the email.
 */
export async function notifySessionReminder(bookingId: string): Promise<void> {
  try {
    const ctx = await loadBookingJoin(bookingId);
    if (!ctx) return;
    const tpl = sessionReminderEmail({
      bookingId: ctx.bookingId,
      venueName: ctx.venueName,
      courtName: ctx.courtName,
      startAt: ctx.startAt,
      endAt: ctx.endAt,
      totalCentavos: ctx.totalCentavos,
      playerDisplayName: ctx.playerDisplayName,
      ...(ctx.paymentMode === "deposit" && ctx.balanceCollectedAt === null
        ? { balanceDueCentavos: ctx.balanceDueCentavos }
        : {}),
    });
    await sendEmail({ to: ctx.playerEmail, ...tpl, tag: "session_reminder" });
  } catch (err) {
    captureException(err, { scope: "notify.session_reminder", extra: { bookingId } });
  }
}
