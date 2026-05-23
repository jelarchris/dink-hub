import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import type { Booking, NewLedgerEntry, Payment, SlotHold } from "@/db/schema";
import { getCurrentBookingFeeRule } from "@/features/system-settings/service";
import { computeCourtFeeAcrossBands } from "@/lib/court-rate";
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
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: unknown }).code === code) return true;
  // Drizzle wraps the underlying postgres error in a DrizzleQueryError;
  // the original PG error (with `.code`) is on `.cause`.
  if ("cause" in err) return isPgError((err as { cause: unknown }).cause, code);
  return false;
}

function durationMinutes(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 60_000;
}

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

function isAtOrBefore(left: Date, right: Date): boolean {
  return left.getTime() <= right.getTime();
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

/**
 * Translate the player's chosen `paymentMode` plus the venue's deposit policy
 * into the four snapshot columns the bookings row carries. Throws
 * BookingError when the player asks for deposit mode but the venue has
 * disabled it or hasn't configured a percentage.
 *
 * Rounding: deposit rounds UP to the nearest whole peso (100 centavos) so
 * the venue is never short. The DB CHECK constraint
 * `bookings_deposit_consistency` re-validates `deposit + balance = total`.
 */
function computeDepositSnapshot(args: {
  mode: "full" | "deposit";
  totalCentavos: bigint;
  venueAllowsPartial: boolean;
  venueDepositPercent: number | null;
}): {
  paymentMode: "full" | "deposit";
  depositCentavos: bigint | null;
  balanceDueCentavos: bigint;
} {
  if (args.mode === "full") {
    return { paymentMode: "full", depositCentavos: null, balanceDueCentavos: 0n };
  }
  if (!args.venueAllowsPartial) {
    throw new BookingError(
      "deposit_not_allowed",
      "Venue does not accept deposit payments — pay in full",
    );
  }
  if (args.venueDepositPercent === null) {
    throw new BookingError(
      "deposit_not_configured",
      "Venue has not configured a deposit percentage",
    );
  }
  const percent = BigInt(args.venueDepositPercent);
  // ceil((total * percent) / 100) → exact centavos, then ceil to nearest peso.
  const exact = (args.totalCentavos * percent + 99n) / 100n;
  const deposit = ((exact + 99n) / 100n) * 100n;
  if (deposit <= 0n || deposit >= args.totalCentavos) {
    // Total is so small the percentage collapses to 0 or to the full amount.
    // Force the player back to full payment rather than fail the CHECK.
    throw new BookingError(
      "deposit_not_allowed",
      "Total is too small to split — pay in full",
    );
  }
  return {
    paymentMode: "deposit",
    depositCentavos: deposit,
    balanceDueCentavos: args.totalCentavos - deposit,
  };
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

  const now = await repo.getDatabaseNow();

  if (isAtOrBefore(startAt, now)) {
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

  if (await repo.hasActiveClosureInRange({ courtId, startAt, endAt })) {
    throw new BookingError("court_closed", "Court is closed during this time window");
  }

  try {
    return await repo.insertSlotHold({
      playerId,
      courtId,
      startAt,
      endAt,
      expiresAt: addMilliseconds(now, HOLD_TTL_MS),
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
  const { playerId, courtId, startAt, endAt, holdId, notes, voucherCode, contactEmail, paymentMode } = parsed.data;

  // Use server clock — reliable within < 1ms of DB clock (NTP-synced).
  // Avoids a SELECT NOW() round-trip that added ~20-40ms for nothing.
  const initialNow = new Date();

  if (isAtOrBefore(startAt, initialNow)) {
    throw new BookingError("validation_failed", "startAt must be in the future");
  }

  // Fire all read-only pre-checks in parallel — previously sequential, each
  // was a separate DB round-trip (~20-30ms each). Now they share one network
  // window and the slowest determines total wait time.
  const [courtRow, hasClosure, rateBands, systemFeeResult] = await Promise.all([
    repo.findCourtById(courtId),
    repo.hasActiveClosureInRange({ courtId, startAt, endAt }),
    repo.findCourtRateBands(courtId),
    getCurrentBookingFeeRule().catch(() => null),
  ]);

  if (!courtRow) throw new BookingError("court_not_found", "Court does not exist");
  if (!courtRow.court.isActive || courtRow.court.deletedAt) {
    throw new BookingError("court_inactive", "Court is not bookable");
  }
  if (courtRow.venue.status !== "active" || courtRow.venue.deletedAt) {
    throw new BookingError("venue_inactive", "Venue is not accepting bookings");
  }

  if (hasClosure) {
    throw new BookingError("court_closed", "Court is closed during this time window");
  }

  // Booking-fee snapshot. Pulled from the platform settings singleton
  // (admin-editable). Fall back to the legacy `system_fee_settings` table
  // only if the new singleton hasn't been seeded yet — keeps test fixtures +
  // older envs working.
  let systemFee: bigint;
  if (systemFeeResult !== null) {
    systemFee = systemFeeResult.snapshotCentavos;
  } else {
    const legacy = await repo.findCurrentSystemFeeCentavos();
    if (legacy === null) {
      throw new BookingError("system_fee_unavailable", "No active booking fee configured");
    }
    systemFee = legacy;
  }

  // Sum per-hour slot rates so bookings that span band boundaries (e.g.
  // 3pm-6pm with a 5pm day/night switch) are priced as 150+150+200 rather
  // than 150×3. Mirrors the UI math in `booking-flow.tsx`.
  const MANILA_OFFSET_MS = 8 * 3_600_000;
  const manilaStartHour = new Date(startAt.getTime() + MANILA_OFFSET_MS).getUTCHours();
  const bandsForFee = rateBands.map((b) => ({
    fromHour: b.fromHour,
    toHour: b.toHour,
    rateCentavos: b.rateCentavos,
  }));
  const duration = durationMinutes(startAt, endAt);
  const courtFee = computeCourtFeeAcrossBands(
    bandsForFee,
    manilaStartHour,
    duration,
    courtRow.court.hourlyRateCentavos,
  );

  // Voucher pre-check (outside the transaction so we fail fast with a nice
  // error before consuming a hold). Re-validated atomically inside the tx.
  let preValidatedVoucher = null as Awaited<
    ReturnType<typeof import("@/features/vouchers").validateVoucherForBooking>
  > | null;
  if (voucherCode) {
    const { validateVoucherForBooking } = await import("@/features/vouchers");
    preValidatedVoucher = await validateVoucherForBooking({
      code: voucherCode,
      userId: playerId,
      courtFeeCentavos: courtFee,
      baseSystemFeeCentavos: systemFee,
      venueId: courtRow.venue.id,
    });
  }

  return db.transaction(async (tx) => {
    // Use server clock inside the transaction too — avoids a SELECT NOW()
    // inside a serializable transaction which would add another round-trip.
    const now = new Date();
    if (isAtOrBefore(startAt, now)) {
      throw new BookingError("validation_failed", "startAt must be in the future");
    }
    const cancellableUntil = addMilliseconds(now, CANCEL_WINDOW_MS);
    const paymentDueAt = addMilliseconds(now, PAYMENT_DUE_TTL_MS);

    // If holdId given, validate ownership + slot match, then consume it.
    if (holdId) {
      const hold = await repo.findHoldById(holdId, tx);
      if (!hold) throw new BookingError("hold_not_found", "Hold does not exist");
      if (hold.playerId !== playerId) {
        throw new BookingError("hold_not_owned", "Hold belongs to another player");
      }
      if (isAtOrBefore(hold.expiresAt, now)) {
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

    // Voucher: re-validate inside the tx (covers per-user cap), insert the
    // booking with the DISCOUNTED system fee snapshot, then atomically
    // increment the redemption count + record the redemption row. A failed
    // increment rolls back the entire booking.
    let finalSystemFee = systemFee;
    let voucherIdToSnapshot: string | null = null;
    let voucherCodeToSnapshot: string | null = null;
    let discountCentavos = 0n;
    let validatedVoucher:
      | Awaited<ReturnType<typeof import("@/features/vouchers").validateVoucherForBooking>>
      | null = null;
    if (voucherCode) {
      const { validateVoucherForBooking } = await import("@/features/vouchers");
      validatedVoucher = await validateVoucherForBooking({
        code: voucherCode,
        userId: playerId,
        courtFeeCentavos: courtFee,
        baseSystemFeeCentavos: systemFee,
        venueId: courtRow.venue.id,
        tx,
      });
      finalSystemFee = validatedVoucher.discountedSystemFeeCentavos;
      discountCentavos = validatedVoucher.discountCentavos;
      voucherIdToSnapshot = validatedVoucher.voucher.id;
      voucherCodeToSnapshot = validatedVoucher.voucher.code;
      void preValidatedVoucher;
    }

    let booking: Booking;
    try {
      // Best-effort: expire any overlapping pending_payment booking on this
      // court whose 15-min window has lapsed. Prevents a phantom EXCLUDE
      // violation when the previous player's hold just expired but the
      // every-minute cron hasn't flipped the row yet.
      await repo.expireOverlappingStalePendingBookings(
        { courtId, startAt, endAt },
        tx,
      );

      booking = await repo.insertBooking(
        {
          playerId,
          courtId,
          venueId: courtRow.venue.id,
          startAt,
          endAt,
          status: "pending_payment",
          courtFeeCentavos: courtFee,
          systemFeeCentavos: finalSystemFee,
          cancellableUntil,
          paymentDueAt,
          notes: notes ?? null,
          voucherId: voucherIdToSnapshot,
          voucherCodeSnapshot: voucherCodeToSnapshot,
          discountCentavos,
          contactEmail: contactEmail ?? null,
          ...computeDepositSnapshot({
            mode: paymentMode,
            totalCentavos: courtFee + finalSystemFee,
            venueAllowsPartial: courtRow.venue.allowPartialPayment,
            venueDepositPercent: courtRow.venue.depositPercent,
          }),
        } as Parameters<typeof repo.insertBooking>[0],
        tx,
      );
    } catch (err) {
      if (isPgError(err, PG_EXCLUSION_VIOLATION)) {
        throw new BookingError("slot_not_available", "Slot was taken by another booking");
      }
      throw err;
    }

    if (validatedVoucher) {
      const { applyVoucherInTransaction } = await import("@/features/vouchers");
      await applyVoucherInTransaction(tx, {
        validated: validatedVoucher,
        bookingId: booking.id,
        userId: playerId,
      });
    }

    return booking;
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
    const now = await repo.getDatabaseNow(tx);
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
    if (isAtOrBefore(booking.paymentDueAt, now)) {
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
    const now = await repo.getDatabaseNow(tx);
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
        verifiedAt: now,
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
    // Zero-amount entries are skipped — the ledger CHECK requires amount >= 1
    // and a 0 entry carries no information (e.g. promo / waived system fee).
    const allEntries: NewLedgerEntry[] = [
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
    const entries = allEntries.filter((e) => e.amountCentavos > 0n);
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
    const now = await repo.getDatabaseNow(tx);
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
        verifiedAt: now,
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
// 7. cancelBooking — player cancels within the 15-min window.
//    Confirmed bookings may already have a paid receipt, so we preserve a
//    refund marker for the admin dispute/manual refund flow.
// ============================================================================
export async function cancelBooking(input: CancelBookingInput): Promise<Booking> {
  const parsed = cancelBookingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BookingError("validation_failed", "Invalid cancel input");
  }
  const { bookingId, playerId } = parsed.data;

  return db.transaction(async (tx) => {
    const now = await repo.getDatabaseNow(tx);
    const booking = await repo.findBookingById(bookingId, tx);
    if (!booking) throw new BookingError("booking_not_found", "Booking not found");
    if (booking.playerId !== playerId) {
      throw new BookingError("booking_not_owned", "Booking belongs to another player");
    }
    if (!["pending_payment", "payment_submitted", "confirmed"].includes(booking.status)) {
      throw new BookingError(
        "booking_not_cancellable",
        `Cannot cancel — status is ${booking.status}.`,
      );
    }
    if (isAtOrBefore(booking.cancellableUntil, now)) {
      throw new BookingError(
        "booking_not_cancellable",
        "15-minute cancellation window has elapsed",
      );
    }

    const noteSuffix =
      booking.status === "confirmed"
        ? booking.totalCentavos > 0n
          ? "[Player cancel]\n[Refund pending — admin dispute flow]"
          : "[Player cancel]"
        : null;
    const newNotes = noteSuffix
      ? booking.notes
        ? `${booking.notes}\n\n${noteSuffix}`
        : noteSuffix
      : booking.notes;

    const cancelled = await repo.updateBookingStatus(
      bookingId,
      booking.version,
      {
        status: "cancelled",
        notes: newNotes,
        cancelledAt: now,
        cancelledBy: playerId,
        cancellationCategory: "player_request",
      },
      tx,
    );
    if (!cancelled) {
      throw new BookingError("concurrent_modification", "Booking was modified concurrently");
    }
    return cancelled;
  });
}

// ============================================================================
// 7b. cancelBookingByOwner — owner-initiated cancellation (Tier 4)
//
// Differs from player cancel:
//   - No 15-min window — owners can cancel any non-terminal booking.
//   - Allowed from {pending_payment, payment_submitted, confirmed}.
//   - Confirmed cancellations leave a marker note; refunds are out-of-band
//     (admin dispute flow handles ledger reversal). We DO NOT auto-touch the
//     ledger here — owner cancel is a state transition only.
//   - Authorization: caller must own the venue (verified via court→venue join).
// ============================================================================
export async function cancelBookingByOwner(
  input: import("./schema").OwnerCancelBookingInput,
): Promise<Booking> {
  const parsed = (
    await import("./schema")
  ).ownerCancelBookingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BookingError("validation_failed", "Invalid cancel input", {
      issues: parsed.error.flatten(),
    });
  }
  const { bookingId, ownerId, expectedVersion, category, reason } = parsed.data;

  const { cancelled, oldStatus } = await db.transaction(async (tx) => {
    const now = await repo.getDatabaseNow(tx);
    const booking = await repo.findBookingById(bookingId, tx);
    if (!booking) throw new BookingError("booking_not_found", "Booking not found");
    if (booking.version !== expectedVersion) {
      throw new BookingError("concurrent_modification", "Booking was modified — reload and retry");
    }

    const courtRow = await repo.findCourtById(booking.courtId, tx);
    if (!courtRow) throw new BookingError("court_not_found", "Court missing for booking");
    if (courtRow.venue.ownerId !== ownerId) {
      throw new BookingError("not_authorized", "Only the venue owner can cancel this booking");
    }

    if (!["pending_payment", "payment_submitted", "confirmed"].includes(booking.status)) {
      throw new BookingError(
        "booking_not_cancellable",
        `Cannot cancel — booking status is ${booking.status}`,
      );
    }

    const noteSuffix =
      booking.status === "confirmed"
        ? `[Owner cancel · ${category}] ${reason}\n[Refund pending — admin dispute flow]`
        : `[Owner cancel · ${category}] ${reason}`;
    const newNotes = booking.notes ? `${booking.notes}\n\n${noteSuffix}` : noteSuffix;

    const cancelledRow = await repo.updateBookingStatus(
      bookingId,
      booking.version,
      {
        status: "cancelled",
        notes: newNotes,
        cancelledAt: now,
        cancelledBy: ownerId,
        cancellationReason: reason,
        cancellationCategory: category,
      },
      tx,
    );
    if (!cancelledRow) {
      throw new BookingError("concurrent_modification", "Booking was modified concurrently");
    }
    return { cancelled: cancelledRow, oldStatus: booking.status };
  });

  // Best-effort audit — never blocks or swallows the booking result.
  try {
    const { profiles: profilesTable } = await import("@/db/schema");
    const { eq: eqOp } = await import("drizzle-orm");
    const actorRows = await db
      .select({ id: profilesTable.id, email: profilesTable.email })
      .from(profilesTable)
      .where(eqOp(profilesTable.id, ownerId))
      .limit(1);
    const actor = actorRows[0];
    if (actor) {
      const { recordAudit } = await import("@/features/admin/audit");
      await recordAudit({
        actor,
        action: "booking.owner_cancel",
        targetType: "booking",
        targetId: bookingId,
        before: { status: oldStatus },
        after: { status: "cancelled" },
        reason,
      });
    }
  } catch (auditErr) {
    console.error("[audit] booking.owner_cancel failed", auditErr);
  }

  return cancelled;
}

// ============================================================================
// 7c. rescheduleBookingByOwner — owner moves a booking to a new slot (Tier 4)
//
// Same court only in v1. Allowed from {payment_submitted, confirmed}.
// Cannot reschedule pending_payment (player still in checkout) or any terminal
// state. The DB EXCLUDE constraint guarantees no double-booking — we catch
// the exclusion violation and translate to slot_not_available.
//
// originalStartAt/originalEndAt are set only on the FIRST reschedule so the
// truly original time survives multiple moves.
// ============================================================================
export async function rescheduleBookingByOwner(
  input: import("./schema").OwnerRescheduleBookingInput,
): Promise<Booking> {
  const parsed = (
    await import("./schema")
  ).ownerRescheduleBookingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BookingError("validation_failed", "Invalid reschedule input", {
      issues: parsed.error.flatten(),
    });
  }
  const { bookingId, ownerId, expectedVersion, newStartAt, newEndAt, newCourtId, reason } = parsed.data;

  const initialNow = await repo.getDatabaseNow();
  if (isAtOrBefore(newStartAt, initialNow)) {
    throw new BookingError("validation_failed", "New start time must be in the future");
  }

  const { updated, beforeState } = await db.transaction(async (tx) => {
    const now = await repo.getDatabaseNow(tx);
    if (isAtOrBefore(newStartAt, now)) {
      throw new BookingError("validation_failed", "New start time must be in the future");
    }

    const booking = await repo.findBookingById(bookingId, tx);
    if (!booking) throw new BookingError("booking_not_found", "Booking not found");
    if (booking.version !== expectedVersion) {
      throw new BookingError("concurrent_modification", "Booking was modified — reload and retry");
    }

    const courtRow = await repo.findCourtById(booking.courtId, tx);
    if (!courtRow) throw new BookingError("court_not_found", "Court missing for booking");
    if (courtRow.venue.ownerId !== ownerId) {
      throw new BookingError("not_authorized", "Only the venue owner can reschedule this booking");
    }

    if (!["payment_submitted", "confirmed"].includes(booking.status)) {
      throw new BookingError(
        "booking_wrong_status",
        `Cannot reschedule — booking status is ${booking.status}`,
      );
    }

    // ── Cross-court move (Tier 8): verify target court + recompute fee ──────
    let targetCourtId = booking.courtId;
    let newCourtFeeCentavos: bigint | null = null;

    if (newCourtId && newCourtId !== booking.courtId) {
      const newCourtRow = await repo.findCourtById(newCourtId, tx);
      if (!newCourtRow) {
        throw new BookingError("court_not_found", "Target court not found");
      }
      if (newCourtRow.venue.id !== courtRow.venue.id) {
        throw new BookingError(
          "validation_failed",
          "Target court must belong to the same venue",
        );
      }
      if (!newCourtRow.court.isActive || newCourtRow.court.deletedAt !== null) {
        throw new BookingError("validation_failed", "Target court is not active");
      }
      targetCourtId = newCourtId;
      const durationMin =
        (newEndAt.getTime() - newStartAt.getTime()) / 60_000;
      newCourtFeeCentavos = computeCourtFeeCentavos(durationMin, newCourtRow.court.hourlyRateCentavos);
    }
    // ────────────────────────────────────────────────────────────────────────

    if (await repo.hasActiveClosureInRange({ courtId: targetCourtId, startAt: newStartAt, endAt: newEndAt }, tx)) {
      throw new BookingError("court_closed", "Court is closed during this time window");
    }

    // Preserve the truly-original time across multiple reschedules.
    const isFirstReschedule = booking.originalStartAt === null;
    const noteSuffix = reason ? `[Owner reschedule] ${reason}` : "[Owner reschedule]";
    const newNotes = booking.notes ? `${booking.notes}\n\n${noteSuffix}` : noteSuffix;

    try {
      const { bookings: bookingsTable } = await import("@/db/schema");
      const { and, eq } = await import("drizzle-orm");
      const rows = await tx
        .update(bookingsTable)
        .set({
          startAt: newStartAt,
          endAt: newEndAt,
          notes: newNotes,
          ...(targetCourtId !== booking.courtId
            ? { courtId: targetCourtId }
            : {}),
          ...(newCourtFeeCentavos !== null
            ? { courtFeeCentavos: newCourtFeeCentavos }
            : {}),
          ...(isFirstReschedule
            ? { originalStartAt: booking.startAt, originalEndAt: booking.endAt }
            : {}),
          rescheduledCount: booking.rescheduledCount + 1,
          lastRescheduledAt: now,
          lastRescheduledBy: ownerId,
        })
        .where(
          and(
            eq(bookingsTable.id, bookingId),
            eq(bookingsTable.version, booking.version),
          ),
        )
        .returning();
      const updatedRow = rows[0];
      if (!updatedRow) {
        throw new BookingError("concurrent_modification", "Booking was modified concurrently");
      }
      return {
        updated: updatedRow,
        beforeState: {
          startAt: booking.startAt,
          endAt: booking.endAt,
          courtId: booking.courtId,
        },
      };
    } catch (err) {
      if (isPgError(err, PG_EXCLUSION_VIOLATION)) {
        throw new BookingError("slot_not_available", "Target slot conflicts with another booking");
      }
      throw err;
    }
  });

  // Best-effort audit — never blocks or swallows the booking result.
  try {
    const { profiles: profilesTable } = await import("@/db/schema");
    const { eq: eqOp } = await import("drizzle-orm");
    const actorRows = await db
      .select({ id: profilesTable.id, email: profilesTable.email })
      .from(profilesTable)
      .where(eqOp(profilesTable.id, ownerId))
      .limit(1);
    const actor = actorRows[0];
    if (actor) {
      const { recordAudit } = await import("@/features/admin/audit");
      await recordAudit({
        actor,
        action: "booking.owner_reschedule",
        targetType: "booking",
        targetId: bookingId,
        before: beforeState,
        after: {
          startAt: updated.startAt,
          endAt: updated.endAt,
          courtId: updated.courtId,
        },
        reason: reason ?? null,
      });
    }
  } catch (auditErr) {
    console.error("[audit] booking.owner_reschedule failed", auditErr);
  }

  return updated;
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

// ============================================================================
// 10b. sendSessionReminders — cron: T-2h player reminder emails
//
// Scans confirmed bookings whose session starts in the next 1h45m–2h15m
// window AND haven't been reminded yet (reminder_sent_at IS NULL).
//
// The 30-minute window matches the cron cadence so every booking is caught
// in exactly one firing. The partial index on (start_at WHERE status =
// 'confirmed' AND reminder_sent_at IS NULL) keeps the scan cheap.
//
// Idempotency: reminder_sent_at is stamped BEFORE the email dispatch.
// If the email send fails the stamp is already set, preventing retry spam.
// We accept one missed email over repeated flooding.
// ============================================================================
export async function sendSessionReminders(): Promise<{ sent: number; skipped: number }> {
  // Import lazily to avoid pulling the email/notification stack into every
  // service consumer (service.ts is imported by many paths).
  const { notifySessionReminder } = await import("./notifications");

  const now = new Date();
  // Window: [now + 1h45m, now + 2h15m) — 30-min span around the T-2h mark.
  const windowStart = new Date(now.getTime() + 105 * 60 * 1_000); // +1h45m
  const windowEnd = new Date(now.getTime() + 135 * 60 * 1_000);   // +2h15m

  const candidates = await repo.findBookingsNeedingReminder(windowStart, windowEnd);
  let sent = 0;
  let skipped = 0;

  for (const { id } of candidates) {
    // Stamp first — prevents duplicate sends if email fails.
    await repo.markReminderSent(id);
    try {
      await notifySessionReminder(id);
      sent++;
    } catch {
      // notifySessionReminder swallows errors internally via captureException,
      // so this catch is a last-resort safety net only.
      skipped++;
    }
  }

  return { sent, skipped };
}

// ============================================================================
// 10. recordOwnerRefund — owner confirms they have refunded the player (Tier 5)
//
// Preconditions:
//   - booking.status MUST be 'refunded' (set by cancelBookingByOwner when the
//     booking was already confirmed/paid, OR by the admin dispute flow).
//   - payment.status MUST be 'verified' (i.e. not already reversed).
//   - ownerId must own the venue the booking belongs to.
//
// Effect (atomic transaction):
//   1. Marks payment.status → 'rejected' (idempotency: re-entry blocked by
//      the unique ledger idempotency_key constraint).
//   2. Writes three reversal ledger entries (mirrors dispute refund_full,
//      but scoped with 'owner-refund' namespace so they don't collide with
//      future admin dispute entries on the same booking).
//
// Ledger double-entry (debits = credits = total_centavos):
//   DEBIT  venue_payable      = courtFeeCentavos   (cancel what the venue was owed)
//   DEBIT  platform_revenue   = systemFeeCentavos  (write off the fee)
//   CREDIT platform_cash      = totalCentavos      (record cash-out to player)
// ============================================================================
export interface RecordOwnerRefundInput {
  bookingId: string;
  paymentId: string;
  paymentExpectedVersion: number;
  ownerId: string;
  /** Optional note shown in payment.rejectionReason. */
  notes?: string;
}

export async function recordOwnerRefund(
  input: RecordOwnerRefundInput,
): Promise<Payment> {
  const { payments: paymentsTable, bookings: bookingsTable, courts, venues } = await import(
    "@/db/schema"
  );
  const { and, eq } = await import("drizzle-orm");

  return db.transaction(async (tx) => {
    const now = await repo.getDatabaseNow(tx);
    // 1. Load and lock payment.
    const payRows = await tx
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, input.paymentId))
      .limit(1);
    const payment = payRows[0];
    if (!payment) throw new BookingError("payment_not_found", "Payment not found");
    if (payment.bookingId !== input.bookingId) {
      throw new BookingError("not_authorized", "Payment does not belong to this booking");
    }
    if (payment.version !== input.paymentExpectedVersion) {
      throw new BookingError(
        "concurrent_modification",
        "Payment was changed in another tab — reload and retry",
      );
    }
    if (payment.status !== "verified") {
      throw new BookingError(
        "booking_wrong_status",
        `Cannot record refund — payment status is "${payment.status}"`,
      );
    }

    // 2. Load booking + verify ownership.
    const bookingRows = await tx
      .select({
        booking: bookingsTable,
        venueOwnerId: venues.ownerId,
      })
      .from(bookingsTable)
      .innerJoin(courts, eq(courts.id, bookingsTable.courtId))
      .innerJoin(venues, eq(venues.id, bookingsTable.venueId))
      .where(eq(bookingsTable.id, input.bookingId))
      .limit(1);
    const row = bookingRows[0];
    if (!row) throw new BookingError("booking_not_found", "Booking not found");
    if (row.venueOwnerId !== input.ownerId) {
      throw new BookingError("not_authorized", "Only the venue owner can record this refund");
    }
    if (row.booking.status !== "refunded") {
      throw new BookingError(
        "booking_wrong_status",
        `Refund can only be recorded on a refunded booking (current: "${row.booking.status}")`,
      );
    }
    const b = row.booking;

    // 3. Mark payment rejected (optimistic concurrency on payment.version).
    const rejectionReason =
      input.notes
        ? `Owner refund: ${input.notes}`
        : "Owner refund recorded";
    const [updatedPayment] = await tx
      .update(paymentsTable)
      .set({
        status: "rejected",
        rejectionReason,
        updatedAt: now,
      })
      .where(
        and(
          eq(paymentsTable.id, payment.id),
          eq(paymentsTable.version, payment.version),
        ),
      )
      .returning();
    if (!updatedPayment) {
      throw new BookingError(
        "concurrent_modification",
        "Payment was changed concurrently — reload and retry",
      );
    }

    // 4. Write reversal ledger entries.
    // Idempotency namespace 'owner-refund' is distinct from 'reverse' used by
    // the admin dispute path so both can coexist without constraint collisions.
    const reversals: NewLedgerEntry[] = [
      {
        bookingId: b.id,
        account: "venue_payable" as const,
        direction: "debit" as const,
        amountCentavos: b.courtFeeCentavos,
        description: `Owner refund — cancel court fee owed to venue (booking ${b.id})`,
        idempotencyKey: `bk:${b.id}:owner-refund:venue_payable`,
        createdBy: input.ownerId,
      },
      {
        bookingId: b.id,
        account: "platform_revenue" as const,
        direction: "debit" as const,
        amountCentavos: b.systemFeeCentavos,
        description: `Owner refund — write off system fee (booking ${b.id})`,
        idempotencyKey: `bk:${b.id}:owner-refund:platform_revenue`,
        createdBy: input.ownerId,
      },
      {
        bookingId: b.id,
        account: "platform_cash" as const,
        direction: "credit" as const,
        amountCentavos: b.totalCentavos,
        description: `Owner refund — cash returned to player (booking ${b.id})`,
        idempotencyKey: `bk:${b.id}:owner-refund:platform_cash`,
        createdBy: input.ownerId,
      },
    ].filter((e) => e.amountCentavos > 0n);

    await repo.insertLedgerEntries(reversals, tx);

    return updatedPayment;
  });
}

// ============================================================================
// 11. previewClosureRange — dry-run for bulk venue closure (Tier 6)
//
// Returns the count + total value of bookings that WOULD be cancelled for the
// given closure window. No writes. Used to show the "12 bookings / ₱14,400"
// confirmation before the owner commits.
// ============================================================================
export interface ClosurePreview {
  bookingCount: number;
  totalCentavos: bigint;
  autoRescheduleableCount: number;
}

export async function previewClosureRange(
  input: import("./schema").ClosureRangeInput,
): Promise<ClosurePreview> {
  const { courts, venues } = await import("@/db/schema");
  const { and, eq, inArray } = await import("drizzle-orm");

  // Verify caller owns the venue + all supplied courtIds belong to it.
  const courtRows = await db
    .select({ id: courts.id })
    .from(courts)
    .innerJoin(venues, eq(venues.id, courts.venueId))
    .where(
      and(
        eq(venues.id, input.venueId),
        eq(venues.ownerId, input.ownerId),
        inArray(courts.id, input.courtIds),
      ),
    );
  if (courtRows.length !== input.courtIds.length) {
    throw new BookingError("not_authorized", "One or more courts do not belong to your venue");
  }

  const rows = await repo.findCancellableBookingsInRange({
    courtIds: input.courtIds,
    fromAt: input.fromAt,
    untilAt: input.untilAt,
  });

  const totalCentavos = rows.reduce((sum, r) => sum + r.totalCentavos, 0n);

  // When auto-reschedule is on, estimate how many bookings could move to a
  // sibling court at the same time. This is a HINT — the truth comes from the
  // EXCLUDE constraint at commit time, which also accounts for slot_holds and
  // open-play shadows. We deliberately don't over-engineer the preview.
  let autoRescheduleableCount = 0;
  if (input.autoReschedule && rows.length > 0) {
    const { courts: courtsT, bookings: bookingsT } = await import("@/db/schema");
    const { and: andF, eq: eqF, inArray: inArrayF, lt: ltF, gt: gtF, isNull: isNullF, ne: neF, not: notF } = await import("drizzle-orm");

    const siblingCourts = await db
      .select({ id: courtsT.id })
      .from(courtsT)
      .where(
        andF(
          eqF(courtsT.venueId, input.venueId),
          eqF(courtsT.isActive, true),
          isNullF(courtsT.deletedAt),
          notF(inArrayF(courtsT.id, input.courtIds)),
        ),
      );
    const siblingIds = siblingCourts.map((c) => c.id);
    if (siblingIds.length > 0) {
      const CANCELLABLE = ["pending_payment", "payment_submitted", "confirmed"] as const;
      for (const candidate of rows) {
        const conflicts = await db
          .select({ courtId: bookingsT.courtId })
          .from(bookingsT)
          .where(
            andF(
              inArrayF(bookingsT.courtId, siblingIds),
              inArrayF(bookingsT.status, CANCELLABLE),
              ltF(bookingsT.startAt, candidate.endAt),
              gtF(bookingsT.endAt, candidate.startAt),
              neF(bookingsT.id, candidate.id),
            ),
          );
        const occupied = new Set(conflicts.map((r) => r.courtId));
        if (siblingIds.some((id) => !occupied.has(id))) {
          autoRescheduleableCount++;
        }
      }
    }
  }

  return {
    bookingCount: rows.length,
    totalCentavos,
    autoRescheduleableCount,
  };
}

// ============================================================================
// 12. closeBookingsForRange — bulk cancel for venue closure (Tier 6)
//
// Cancels all active bookings on the given courts in the window in a SINGLE
// transaction. All rows get the same cancellation metadata (category, reason,
// timestamp, actor). Notifications fire after the tx commits via
// Promise.allSettled (best-effort, never blocks the action result).
//
// Returns `{ cancelledCount, skippedCount }`. A booking is skipped if it was
// modified between the preview and the commit (version mismatch — extremely
// rare; caller may retry or ignore).
//
// Notification volume note: at ≤30 bookings per closure this is fine
// synchronously. For larger volumes, move to a notification queue.
// ============================================================================
export interface CloseBookingsResult {
  cancelledCount: number;
  skippedCount: number;
  autoRescheduledCount: number;
}

export interface AutoRescheduledMove {
  /** New booking on a sibling court (status='confirmed', rebook of parent). */
  newBookingId: string;
  /** Court name BEFORE the move — used in the player email. */
  oldCourtName: string;
  /** Original times (unchanged) — surfaced in the email's ICS replacement. */
  oldStartAt: Date;
  oldEndAt: Date;
}

export async function closeBookingsForRange(
  input: import("./schema").ClosureRangeInput,
): Promise<{
  result: CloseBookingsResult;
  cancelledBookingIds: string[];
  autoRescheduledMoves: AutoRescheduledMove[];
}> {
  const { bookings: bookingsTable, courtClosures, courts, venues } = await import("@/db/schema");
  const { and, eq, inArray, isNull, not } = await import("drizzle-orm");

  // Re-verify ownership inside the write path (defense in depth).
  const courtRows = await db
    .select({ id: courts.id })
    .from(courts)
    .innerJoin(venues, eq(venues.id, courts.venueId))
    .where(
      and(
        eq(venues.id, input.venueId),
        eq(venues.ownerId, input.ownerId),
        inArray(courts.id, input.courtIds),
      ),
    );
  if (courtRows.length !== input.courtIds.length) {
    throw new BookingError("not_authorized", "One or more courts do not belong to your venue");
  }

  // Sibling courts at the venue (active, not part of this closure). Used as
  // candidates for same-time auto-reschedule when input.autoReschedule is on.
  const siblingCourtRows = input.autoReschedule
    ? await db
        .select({ id: courts.id, name: courts.name })
        .from(courts)
        .where(
          and(
            eq(courts.venueId, input.venueId),
            eq(courts.isActive, true),
            isNull(courts.deletedAt),
            not(inArray(courts.id, input.courtIds)),
          ),
        )
        .orderBy(courts.name)
    : [];

  const candidates = await repo.findCancellableBookingsInRange({
    courtIds: input.courtIds,
    fromAt: input.fromAt,
    untilAt: input.untilAt,
  });

  if (candidates.length === 0) {
    return {
      result: { cancelledCount: 0, skippedCount: 0, autoRescheduledCount: 0 },
      cancelledBookingIds: [],
      autoRescheduledMoves: [],
    };
  }

  // Map original courtId → courtName for auto-reschedule email context.
  const courtNameById = new Map<string, string>();
  {
    const allCourtNameRows = await db
      .select({ id: courts.id, name: courts.name })
      .from(courts)
      .where(inArray(courts.id, input.courtIds));
    for (const c of allCourtNameRows) courtNameById.set(c.id, c.name);
  }

  const noteText = `[Owner closure · ${input.category}] ${input.reason}`;
  let cancelledCount = 0;
  let skippedCount = 0;
  let autoRescheduledCount = 0;
  const cancelledBookingIds: string[] = [];
  const autoRescheduledMoves: AutoRescheduledMove[] = [];

  // Single transaction — all-or-nothing across the batch.
  await db.transaction(async (tx) => {
    const now = await repo.getDatabaseNow(tx);
    const autoRescheduleCancellableUntil = addMilliseconds(now, 24 * 60 * 60_000);
    const autoReschedulePaymentDueAt = addMilliseconds(now, 24 * 60 * 60_000);

    for (const candidate of candidates) {
      // Reload within tx to get current version + notes (guard against races).
      const fresh = await tx
        .select({
          version: bookingsTable.version,
          notes: bookingsTable.notes,
          playerId: bookingsTable.playerId,
          venueId: bookingsTable.venueId,
          courtFeeCentavos: bookingsTable.courtFeeCentavos,
          systemFeeCentavos: bookingsTable.systemFeeCentavos,
          discountCentavos: bookingsTable.discountCentavos,
          voucherId: bookingsTable.voucherId,
          voucherCodeSnapshot: bookingsTable.voucherCodeSnapshot,
          contactEmail: bookingsTable.contactEmail,
        })
        .from(bookingsTable)
        .where(eq(bookingsTable.id, candidate.id))
        .limit(1);
      const row = fresh[0];
      if (!row || row.version !== candidate.version) {
        // Modified between preview and commit — skip rather than fail the batch.
        skippedCount++;
        continue;
      }

      // ---- Try auto-reschedule onto a sibling court (savepoint per attempt) ----
      let movedTo: { newBookingId: string; newCourtName: string } | null = null;
      if (input.autoReschedule && siblingCourtRows.length > 0) {
        for (const sibling of siblingCourtRows) {
          try {
            const newId = await tx.transaction(async (sp) => {
              const inserted = await sp
                .insert(bookingsTable)
                .values({
                  playerId: row.playerId,
                  venueId: row.venueId,
                  courtId: sibling.id,
                  startAt: candidate.startAt,
                  endAt: candidate.endAt,
                  status: "confirmed",
                  courtFeeCentavos: row.courtFeeCentavos,
                  systemFeeCentavos: row.systemFeeCentavos,
                  discountCentavos: row.discountCentavos,
                  ...(row.voucherId ? { voucherId: row.voucherId } : {}),
                  ...(row.voucherCodeSnapshot
                    ? { voucherCodeSnapshot: row.voucherCodeSnapshot }
                    : {}),
                  ...(row.contactEmail ? { contactEmail: row.contactEmail } : {}),
                  cancellableUntil: autoRescheduleCancellableUntil,
                  paymentDueAt: autoReschedulePaymentDueAt,
                  rebookOfId: candidate.id,
                  notes: `Auto-moved from ${courtNameById.get(candidate.courtId) ?? candidate.courtId} due to closure (${input.category}): ${input.reason}`,
                })
                .returning({ id: bookingsTable.id });
              const ins = inserted[0];
              if (!ins) throw new Error("auto-move insert returned no row");
              return ins.id;
            });
            movedTo = { newBookingId: newId, newCourtName: sibling.name };
            break;
          } catch (err) {
            // 23P01 (EXCLUDE GiST) — sibling court occupied at same time. Try next.
            // 23505 (partial unique) — parent already has an active rebook. Stop.
            if (isPgError(err, PG_EXCLUSION_VIOLATION)) continue;
            if (isPgError(err, PG_UNIQUE_VIOLATION)) break;
            throw err;
          }
        }
      }

      const noteExtra = movedTo
        ? `\n[Auto-moved to ${movedTo.newCourtName} · same time]`
        : "";
      const newNotes = row.notes
        ? `${row.notes}\n\n${noteText}${noteExtra}`
        : `${noteText}${noteExtra}`;

      const updated = await tx
        .update(bookingsTable)
        .set({
          status: "cancelled",
          notes: newNotes,
          cancelledAt: now,
          cancelledBy: input.ownerId,
          cancellationReason: input.reason,
          cancellationCategory: input.category,
          updatedAt: now,
        })
        .where(
          and(
            eq(bookingsTable.id, candidate.id),
            eq(bookingsTable.version, row.version),
          ),
        )
        .returning({ id: bookingsTable.id });

      if (updated.length > 0 && updated[0]) {
        if (movedTo) {
          autoRescheduledCount++;
          autoRescheduledMoves.push({
            newBookingId: movedTo.newBookingId,
            oldCourtName: courtNameById.get(candidate.courtId) ?? "another court",
            oldStartAt: candidate.startAt,
            oldEndAt: candidate.endAt,
          });
        } else {
          cancelledCount++;
          cancelledBookingIds.push(updated[0].id);
        }
      } else {
        skippedCount++;
      }
    }

    // Block new bookings on the closed window by writing court_closures rows.
    // getCourtsOccupancy UNIONs court_closures, so any future picker call will
    // see the window as unavailable. Closures are intentional historical
    // evidence — never GC'd. We tolerate EXCLUDE overlap (23P01) silently in
    // case the owner has already scheduled a partial overlap manually.
    const truncatedReason = input.reason.slice(0, 500);
    for (const courtId of input.courtIds) {
      try {
        await tx.insert(courtClosures).values({
          courtId,
          createdBy: input.ownerId,
          startAt: input.fromAt,
          endAt: input.untilAt,
          reason: truncatedReason,
        });
      } catch (err) {
        if (isPgError(err, PG_EXCLUSION_VIOLATION)) continue;
        throw err;
      }
    }
  });

  return {
    result: { cancelledCount, skippedCount, autoRescheduledCount },
    cancelledBookingIds,
    autoRescheduledMoves,
  };
}

// Internal helper exposed for tests only — do not import from app code.
export const _testing = { computeCourtFeeCentavos, randomUUID };

// ============================================================================
// 13. rebookFromClosure — player self-rebook after venue closure
//
// When a booking is cancelled with category venue_closure | weather |
// court_unavailable, the player has a one-time free rebook for any same-
// venue / same-duration slot. Fees are SNAPSHOTTED from the parent so the
// player owes no new payment and the platform records identical revenue.
//
// Race safety:
//   - bookings_one_active_rebook_per_parent (partial unique index, DB) is
//     the authoritative double-rebook guard.
//   - bookings EXCLUDE constraint prevents overlap with any existing
//     booking/hold/open-play shadow on the new court.
// ============================================================================
const FREE_REBOOK_CATEGORIES = new Set<NonNullable<Booking["cancellationCategory"]>>([
  "venue_closure",
  "weather",
  "court_unavailable",
]);
const REBOOK_CANCEL_WINDOW_MS = CANCEL_WINDOW_MS;
const REBOOK_PAYMENT_DUE_MS = 24 * 60 * 60_000;

export interface RebookFromClosureInput {
  playerId: string;
  parentBookingId: string;
  courtId: string;
  startAt: Date;
  endAt: Date;
}

export async function rebookFromClosure(
  input: RebookFromClosureInput,
): Promise<{ id: string; startAt: Date; endAt: Date }> {
  const { bookings: bk, courts } = await import("@/db/schema");
  const { and, eq, inArray } = await import("drizzle-orm");

  return db.transaction(async (tx) => {
    const parentRows = await tx
      .select()
      .from(bk)
      .where(eq(bk.id, input.parentBookingId))
      .limit(1);
    const parent = parentRows[0];
    if (!parent) throw new BookingError("booking_not_found", "Original booking not found.");
    if (parent.playerId !== input.playerId)
      throw new BookingError("booking_not_owned", "Not your booking.");
    if (parent.status !== "cancelled")
      throw new BookingError("booking_wrong_status", "Original booking is not cancelled.");
    if (
      !parent.cancellationCategory ||
      !FREE_REBOOK_CATEGORIES.has(parent.cancellationCategory)
    )
      throw new BookingError(
        "booking_wrong_status",
        "Only venue-closure cancellations can be rebooked for free.",
      );

    const parentMinutes = durationMinutes(parent.startAt, parent.endAt);
    const newMinutes = durationMinutes(input.startAt, input.endAt);
    if (newMinutes !== parentMinutes)
      throw new BookingError(
        "validation_failed",
        `New slot must be ${parentMinutes / 60}h to match the original.`,
      );

    const courtRows = await tx
      .select({ venueId: courts.venueId })
      .from(courts)
      .where(eq(courts.id, input.courtId))
      .limit(1);
    const court = courtRows[0];
    if (!court) throw new BookingError("court_not_found", "Court not found.");
    if (court.venueId !== parent.venueId)
      throw new BookingError("validation_failed", "Rebook must be at the same venue.");

    if (
      input.startAt.getUTCMinutes() !== 0 ||
      input.startAt.getUTCSeconds() !== 0 ||
      input.endAt.getUTCMinutes() !== 0 ||
      input.endAt.getUTCSeconds() !== 0
    )
      throw new BookingError("validation_failed", "Slot must align to the hour.");

    const now = await repo.getDatabaseNow(tx);
    if (isAtOrBefore(input.startAt, now))
      throw new BookingError("validation_failed", "Pick a future time.");

    // Defense-in-depth — the partial unique index is authoritative.
    const existing = await tx
      .select({ id: bk.id })
      .from(bk)
      .where(
        and(
          eq(bk.rebookOfId, parent.id),
          inArray(bk.status, ["pending_payment", "payment_submitted", "confirmed"]),
        ),
      );
    if (existing.length > 0)
      throw new BookingError(
        "booking_wrong_status",
        "You've already rebooked this cancelled booking.",
      );

    const cancellableUntil = addMilliseconds(now, REBOOK_CANCEL_WINDOW_MS);
    const paymentDueAt = addMilliseconds(now, REBOOK_PAYMENT_DUE_MS);

    try {
      const inserted = await tx
        .insert(bk)
        .values({
          playerId: input.playerId,
          venueId: parent.venueId,
          courtId: input.courtId,
          startAt: input.startAt,
          endAt: input.endAt,
          status: "confirmed",
          courtFeeCentavos: parent.courtFeeCentavos,
          systemFeeCentavos: parent.systemFeeCentavos,
          discountCentavos: parent.discountCentavos,
          ...(parent.voucherId ? { voucherId: parent.voucherId } : {}),
          ...(parent.voucherCodeSnapshot
            ? { voucherCodeSnapshot: parent.voucherCodeSnapshot }
            : {}),
          ...(parent.contactEmail ? { contactEmail: parent.contactEmail } : {}),
          cancellableUntil,
          paymentDueAt,
          rebookOfId: parent.id,
          notes: `Free rebook of ${parent.id} (original ${parent.startAt.toISOString()})`,
        })
        .returning({ id: bk.id, startAt: bk.startAt, endAt: bk.endAt });
      const row = inserted[0];
      if (!row) throw new BookingError("validation_failed", "Insert failed.");
      return row;
    } catch (err) {
      if (isPgError(err, PG_EXCLUSION_VIOLATION))
        throw new BookingError(
          "slot_not_available",
          "That slot is no longer available — pick another.",
        );
      if (isPgError(err, PG_UNIQUE_VIOLATION))
        throw new BookingError(
          "booking_wrong_status",
          "You've already rebooked this cancelled booking.",
        );
      throw err;
    }
  });
}

