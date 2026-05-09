import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import type { Booking, NewLedgerEntry, Payment, SlotHold } from "@/db/schema";
import { BookingError } from "./errors";
import * as repo from "./repo";
import {
  cancelBookingInputSchema,
  createBookingInputSchema,
  holdSlotInputSchema,
  rejectPaymentInputSchema,
  releaseHoldInputSchema,
  submitPaymentInputSchema,
  verifyPaymentInputSchema,
  type CancelBookingInput,
  type CreateBookingInput,
  type HoldSlotInput,
  type RejectPaymentInput,
  type ReleaseHoldInput,
  type SubmitPaymentInput,
  type VerifyPaymentInput,
} from "./schema";

/**
 * Booking service. All public business operations live here.
 *
 * Authorization model:
 *   - Player operations: caller's `playerId` is supplied and re-checked against
 *     the booking row's `player_id` server-side. Never trust the client.
 *   - Owner operations (verify/reject payment): caller's `verifierId` must match
 *     the booking's venue.owner_id OR be an admin (admin path lives in admin svc).
 *
 * Concurrency model:
 *   - DB EXCLUDE constraint physically prevents double-booking → race-free.
 *   - Optimistic concurrency via `version` on every mutating UPDATE.
 *   - Multi-row writes (verify payment + ledger entries) wrap in a serializable
 *     transaction.
 */

const HOLD_TTL_MS = 15 * 60_000; // 15 minutes
const PAYMENT_DUE_TTL_MS = 15 * 60_000; // 15 minutes
const CANCEL_WINDOW_MS = 15 * 60_000; // 15 minutes

// PG error codes
const PG_EXCLUSION_VIOLATION = "23P01";
const PG_UNIQUE_VIOLATION = "23505";

function isPgError(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === code;
}

function durationMinutes(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 60_000;
}

/**
 * Compute court fee in centavos for a slot. Duration is always a multiple of 30
 * minutes (DB-enforced), and hourly_rate is centavos/hour, so:
 *   fee = floor(duration_minutes * hourly_rate / 60)
 * is exact integer arithmetic with no rounding loss.
 */
function computeCourtFeeCentavos(durationMin: number, hourlyRate: bigint): bigint {
  return (BigInt(durationMin) * hourlyRate) / 60n;
}

// ============================================================================
// 1. holdSlot — temporary reservation while user fills the booking form
// ============================================================================
export async function holdSlot(input: HoldSlotInput): Promise<SlotHold> {
  const parsed = holdSlotInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BookingError("validation_failed", "Invalid slot hold input", {
      issues: parsed.error.flatten(),
    });
  }
  const { playerId, courtId, startAt, endAt } = parsed.data;

  if (startAt.getTime() <= Date.now()) {
    throw new BookingError("validation_failed", "startAt must be in the future");
  }

  const courtRow = await repo.findCourtById(courtId);
  if (!courtRow) throw new BookingError("court_not_found", "Court does not exist");
  if (!courtRow.court.isActive || courtRow.court.deletedAt) {
    throw new BookingError("court_inactive", "Court is not bookable");
  }
  if (courtRow.venue.status !== "active" || courtRow.venue.deletedAt) {
    throw new BookingError("venue_inactive", "Venue is not accepting bookings");
  }

  try {
    return await repo.insertSlotHold({
      playerId,
      courtId,
      startAt,
      endAt,
      expiresAt: new Date(Date.now() + HOLD_TTL_MS),
    });
  } catch (err) {
    if (isPgError(err, PG_EXCLUSION_VIOLATION)) {
      throw new BookingError("slot_not_available", "Slot is currently held or booked");
    }
    throw err;
  }
}

// ============================================================================
// 2. releaseHold — explicit release (player navigates away / cancels picker)
// ============================================================================
export async function releaseHold(input: ReleaseHoldInput): Promise<void> {
  const parsed = releaseHoldInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BookingError("validation_failed", "Invalid release hold input");
  }
  const { holdId, playerId } = parsed.data;

  const hold = await repo.findHoldById(holdId);
  if (!hold) return; // already gone — idempotent
  if (hold.playerId !== playerId) {
    throw new BookingError("hold_not_owned", "Hold belongs to a different player");
  }
  await repo.deleteHoldById(holdId);
}

// ============================================================================
// 3. createBooking — promote a held slot into a real booking awaiting payment
// ============================================================================
export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const parsed = createBookingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BookingError("validation_failed", "Invalid booking input", {
      issues: parsed.error.flatten(),
    });
  }
  const { playerId, courtId, startAt, endAt, holdId, notes } = parsed.data;

  if (startAt.getTime() <= Date.now()) {
    throw new BookingError("validation_failed", "startAt must be in the future");
  }

  const courtRow = await repo.findCourtById(courtId);
  if (!courtRow) throw new BookingError("court_not_found", "Court does not exist");
  if (!courtRow.court.isActive || courtRow.court.deletedAt) {
    throw new BookingError("court_inactive", "Court is not bookable");
  }
  if (courtRow.venue.status !== "active" || courtRow.venue.deletedAt) {
    throw new BookingError("venue_inactive", "Venue is not accepting bookings");
  }

  const systemFee = await repo.findCurrentSystemFeeCentavos();
  if (systemFee === null) {
    throw new BookingError("system_fee_unavailable", "No active system fee configured");
  }

  const courtFee = computeCourtFeeCentavos(
    durationMinutes(startAt, endAt),
    courtRow.court.hourlyRateCentavos,
  );

  const now = new Date();
  const cancellableUntil = new Date(now.getTime() + CANCEL_WINDOW_MS);
  const paymentDueAt = new Date(now.getTime() + PAYMENT_DUE_TTL_MS);

  return db.transaction(async (tx) => {
    // If holdId given, validate ownership + slot match, then consume it.
    if (holdId) {
      const hold = await repo.findHoldById(holdId, tx);
      if (!hold) throw new BookingError("hold_not_found", "Hold does not exist");
      if (hold.playerId !== playerId) {
        throw new BookingError("hold_not_owned", "Hold belongs to another player");
      }
      if (hold.expiresAt.getTime() <= Date.now()) {
        throw new BookingError("hold_expired", "Hold has expired — please re-select the slot");
      }
      if (
        hold.courtId !== courtId ||
        hold.startAt.getTime() !== startAt.getTime() ||
        hold.endAt.getTime() !== endAt.getTime()
      ) {
        throw new BookingError("validation_failed", "Hold does not match requested slot");
      }
      // Delete the hold first so the booking insert doesn't collide with it
      // on the EXCLUDE constraint (both target the same court time-range).
      await repo.deleteHoldById(holdId, tx);
    }

    try {
      return await repo.insertBooking(
        {
          playerId,
          courtId,
          venueId: courtRow.venue.id,
          startAt,
          endAt,
          status: "pending_payment",
          courtFeeCentavos: courtFee,
          systemFeeCentavos: systemFee,
          cancellableUntil,
          paymentDueAt,
          notes: notes ?? null,
        } as Parameters<typeof repo.insertBooking>[0],
        tx,
      );
    } catch (err) {
      if (isPgError(err, PG_EXCLUSION_VIOLATION)) {
        throw new BookingError("slot_not_available", "Slot was taken by another booking");
      }
      throw err;
    }
  });
}

// ============================================================================
// 4. submitPayment — player uploads GCash receipt
// ============================================================================
export async function submitPayment(input: SubmitPaymentInput): Promise<Payment> {
  const parsed = submitPaymentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BookingError("validation_failed", "Invalid payment submission", {
      issues: parsed.error.flatten(),
    });
  }
  const { bookingId, playerId, receiptImagePath, receiptHash, amountCentavos, gcashReferenceNumber } =
    parsed.data;

  return db.transaction(async (tx) => {
    const booking = await repo.findBookingById(bookingId, tx);
    if (!booking) throw new BookingError("booking_not_found", "Booking not found");
    if (booking.playerId !== playerId) {
      throw new BookingError("booking_not_owned", "Booking belongs to another player");
    }
    if (booking.status !== "pending_payment") {
      throw new BookingError(
        "booking_wrong_status",
        `Cannot submit payment — booking status is ${booking.status}`,
      );
    }
    if (booking.paymentDueAt.getTime() <= Date.now()) {
      throw new BookingError("booking_wrong_status", "Payment window has expired");
    }
    if (amountCentavos !== booking.totalCentavos) {
      throw new BookingError("payment_amount_mismatch", "Receipt amount does not match booking total", {
        expected: booking.totalCentavos.toString(),
        received: amountCentavos.toString(),
      });
    }

    let payment: Payment;
    try {
      payment = await repo.insertPayment(
        {
          bookingId,
          receiptImagePath,
          receiptHash,
          amountCentavos,
          gcashReferenceNumber: gcashReferenceNumber ?? null,
          submittedBy: playerId,
        } as Parameters<typeof repo.insertPayment>[0],
        tx,
      );
    } catch (err) {
      if (isPgError(err, PG_UNIQUE_VIOLATION)) {
        throw new BookingError("duplicate_receipt", "This receipt has already been submitted");
      }
      throw err;
    }

    const updated = await repo.updateBookingStatus(
      bookingId,
      booking.version,
      { status: "payment_submitted" },
      tx,
    );
    if (!updated) {
      throw new BookingError("concurrent_modification", "Booking was modified concurrently");
    }
    return payment;
  });
}

// ============================================================================
// 5. verifyPayment — venue owner confirms money received
//    Writes ledger entries: DEBIT venue_payable, CREDIT platform_revenue
// ============================================================================
export async function verifyPayment(input: VerifyPaymentInput): Promise<Payment> {
  const parsed = verifyPaymentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BookingError("validation_failed", "Invalid verify input");
  }
  const { paymentId, verifierId } = parsed.data;

  return db.transaction(async (tx) => {
    const payment = await repo.findPaymentById(paymentId, tx);
    if (!payment) throw new BookingError("payment_not_found", "Payment not found");
    if (payment.status === "verified") {
      throw new BookingError("payment_already_verified", "Payment is already verified");
    }
    if (payment.status !== "submitted") {
      throw new BookingError(
        "booking_wrong_status",
        `Cannot verify — payment status is ${payment.status}`,
      );
    }

    const booking = await repo.findBookingById(payment.bookingId, tx);
    if (!booking) throw new BookingError("booking_not_found", "Booking not found");

    const courtRow = await repo.findCourtById(booking.courtId, tx);
    if (!courtRow) throw new BookingError("court_not_found", "Court missing for booking");
    if (courtRow.venue.ownerId !== verifierId) {
      throw new BookingError("not_authorized", "Only the venue owner can verify this payment");
    }

    const verifiedPayment = await repo.updatePayment(
      paymentId,
      payment.version,
      {
        status: "verified",
        verifiedBy: verifierId,
        verifiedAt: new Date(),
      },
      tx,
    );
    if (!verifiedPayment) {
      throw new BookingError("concurrent_modification", "Payment was modified concurrently");
    }

    const confirmedBooking = await repo.updateBookingStatus(
      booking.id,
      booking.version,
      { status: "confirmed" },
      tx,
    );
    if (!confirmedBooking) {
      throw new BookingError("concurrent_modification", "Booking was modified concurrently");
    }

    // Double-entry: we owe the venue the court fee; we earned the system fee.
    // Sum of debits === sum of credits === total_centavos.
    const entries: NewLedgerEntry[] = [
      {
        bookingId: booking.id,
        account: "venue_payable",
        direction: "credit", // liability increases on the credit side
        amountCentavos: booking.courtFeeCentavos,
        description: `Court fee owed to venue for booking ${booking.id}`,
        idempotencyKey: `bk:${booking.id}:venue_payable`,
        createdBy: verifierId,
      },
      {
        bookingId: booking.id,
        account: "platform_revenue",
        direction: "credit", // revenue increases on the credit side
        amountCentavos: booking.systemFeeCentavos,
        description: `System fee revenue for booking ${booking.id}`,
        idempotencyKey: `bk:${booking.id}:platform_revenue`,
        createdBy: verifierId,
      },
      {
        bookingId: booking.id,
        account: "platform_cash",
        direction: "debit", // we conceptually received the full amount on venue's behalf
        amountCentavos: booking.totalCentavos,
        description: `Cash received (held by venue) for booking ${booking.id}`,
        idempotencyKey: `bk:${booking.id}:platform_cash`,
        createdBy: verifierId,
      },
    ];
    await repo.insertLedgerEntries(entries, tx);

    return verifiedPayment;
  });
}

// ============================================================================
// 6. rejectPayment — venue marks receipt invalid; booking returns to pending
// ============================================================================
export async function rejectPayment(input: RejectPaymentInput): Promise<Payment> {
  const parsed = rejectPaymentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BookingError("validation_failed", "Invalid reject input");
  }
  const { paymentId, verifierId, reason } = parsed.data;

  return db.transaction(async (tx) => {
    const payment = await repo.findPaymentById(paymentId, tx);
    if (!payment) throw new BookingError("payment_not_found", "Payment not found");
    if (payment.status !== "submitted") {
      throw new BookingError("booking_wrong_status", `Cannot reject — status is ${payment.status}`);
    }

    const booking = await repo.findBookingById(payment.bookingId, tx);
    if (!booking) throw new BookingError("booking_not_found", "Booking not found");
    const courtRow = await repo.findCourtById(booking.courtId, tx);
    if (!courtRow) throw new BookingError("court_not_found", "Court missing for booking");
    if (courtRow.venue.ownerId !== verifierId) {
      throw new BookingError("not_authorized", "Only the venue owner can reject this payment");
    }

    const rejected = await repo.updatePayment(
      paymentId,
      payment.version,
      {
        status: "rejected",
        verifiedBy: verifierId,
        verifiedAt: new Date(),
        rejectionReason: reason,
      },
      tx,
    );
    if (!rejected) {
      throw new BookingError("concurrent_modification", "Payment was modified concurrently");
    }

    // Booking flips back to pending_payment so player can re-upload.
    const reverted = await repo.updateBookingStatus(
      booking.id,
      booking.version,
      { status: "pending_payment" },
      tx,
    );
    if (!reverted) {
      throw new BookingError("concurrent_modification", "Booking was modified concurrently");
    }

    return rejected;
  });
}

// ============================================================================
// 7. cancelBooking — player cancels within the 15-min window
//    Post-confirmation cancellations require admin (refund flow).
// ============================================================================
export async function cancelBooking(input: CancelBookingInput): Promise<Booking> {
  const parsed = cancelBookingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BookingError("validation_failed", "Invalid cancel input");
  }
  const { bookingId, playerId } = parsed.data;

  return db.transaction(async (tx) => {
    const booking = await repo.findBookingById(bookingId, tx);
    if (!booking) throw new BookingError("booking_not_found", "Booking not found");
    if (booking.playerId !== playerId) {
      throw new BookingError("booking_not_owned", "Booking belongs to another player");
    }
    if (!["pending_payment", "payment_submitted"].includes(booking.status)) {
      throw new BookingError(
        "booking_not_cancellable",
        `Cannot cancel — status is ${booking.status}. Confirmed bookings require admin refund.`,
      );
    }
    if (booking.cancellableUntil.getTime() <= Date.now()) {
      throw new BookingError(
        "booking_not_cancellable",
        "15-minute cancellation window has elapsed",
      );
    }

    const cancelled = await repo.updateBookingStatus(
      bookingId,
      booking.version,
      { status: "cancelled" },
      tx,
    );
    if (!cancelled) {
      throw new BookingError("concurrent_modification", "Booking was modified concurrently");
    }
    return cancelled;
  });
}

// ============================================================================
// 8. expireUnpaidBookings — cron: mark pending_payment past due as expired
//    Each booking is expired in its own optimistic update so failures don't
//    poison the batch.
// ============================================================================
export async function expireUnpaidBookings(limit = 100): Promise<{ expired: number; skipped: number }> {
  const candidates = await repo.findExpiredPendingBookings(limit);
  let expired = 0;
  let skipped = 0;
  for (const c of candidates) {
    const updated = await repo.updateBookingStatus(c.id, c.version, { status: "expired" });
    if (updated) expired++;
    else skipped++;
  }
  return { expired, skipped };
}

// ============================================================================
// 9. releaseExpiredHolds — cron: DELETE expired slot_holds
// ============================================================================
export async function releaseExpiredHolds(): Promise<{ released: number }> {
  const released = await repo.deleteExpiredHolds();
  return { released };
}

// Internal helper exposed for tests only — do not import from app code.
export const _testing = { computeCourtFeeCentavos, randomUUID };
