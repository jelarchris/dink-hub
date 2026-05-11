import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, courts, payments, profiles, venues } from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import {
  bookingCancelledByPlayerEmail,
  bookingForceCancelledEmail,
  disputeOpenedEmail,
  disputeResolvedEmail,
  paymentRejectedEmail,
  paymentSubmittedEmail,
  paymentVerifiedEmail,
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
  courtName: string;
  venueName: string;
  ownerEmail: string;
  ownerDisplayName: string;
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
      playerId: bookings.playerId,
      courtName: courts.name,
      venueName: venues.name,
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
    .select({ email: profiles.email, displayName: profiles.displayName })
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
    courtName: base.courtName,
    venueName: base.venueName,
    ownerEmail: ownerRow.email,
    ownerDisplayName: ownerRow.displayName,
    playerEmail: playerRow.email,
    playerDisplayName: playerRow.displayName,
    gcashReferenceNumber: paymentRow?.ref ?? null,
  };
}

export async function notifyPaymentSubmitted(bookingId: string): Promise<void> {
  try {
    const ctx = await loadBookingJoin(bookingId);
    if (!ctx) return;
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
    await sendEmail({ to: ctx.playerEmail, ...tpl, tag: "booking_cancelled_by_owner" });
  } catch (err) {
    captureException(err, { scope: "notify.booking_cancelled_by_owner", extra: { bookingId } });
  }
}

/**
 * Owner-initiated reschedule notification. Inline minimal email \u2014 dedicated
 * template + ICS attachment is a follow-up.
 */
export async function notifyBookingRescheduledByOwner(
  bookingId: string,
  oldStartAt: Date,
  oldEndAt: Date,
): Promise<void> {
  try {
    const ctx = await loadBookingJoin(bookingId);
    if (!ctx) return;
    const fmt = (d: Date) =>
      d.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "medium",
        timeStyle: "short",
      });
    const oldWhen = `${fmt(oldStartAt)} \u2013 ${fmt(oldEndAt)}`;
    const newWhen = `${fmt(ctx.startAt)} \u2013 ${fmt(ctx.endAt)}`;
    const subject = `Your booking was rescheduled \u2014 ${ctx.venueName}`;
    const text =
      `Hi ${ctx.playerDisplayName},\n\n` +
      `${ctx.venueName} rescheduled your booking on ${ctx.courtName}.\n\n` +
      `Original time: ${oldWhen}\n` +
      `New time:      ${newWhen}\n\n` +
      `If the new time doesn't work, reply to this email to coordinate with the venue.\n`;
    const html =
      `<p>Hi ${ctx.playerDisplayName},</p>` +
      `<p><strong>${ctx.venueName}</strong> rescheduled your booking on <strong>${ctx.courtName}</strong>.</p>` +
      `<p><strong>Original:</strong> ${oldWhen}<br/><strong>New:</strong> ${newWhen}</p>` +
      `<p>If the new time doesn't work, reply to this email to coordinate with the venue.</p>`;
    await sendEmail({
      to: ctx.playerEmail,
      subject,
      html,
      text,
      tag: "booking_rescheduled_by_owner",
    });
  } catch (err) {
    captureException(err, { scope: "notify.booking_rescheduled_by_owner", extra: { bookingId } });
  }
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
