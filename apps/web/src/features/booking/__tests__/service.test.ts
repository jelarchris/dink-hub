import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  autoConfirmEligibleBookings,
  cancelBooking,
  createBooking,
  expireUnpaidBookings,
  holdSlot,
  lateConfirmPayment,
  rejectPayment,
  releaseExpiredHolds,
  releaseHold,
  sendOwnerVerificationNudges,
  submitPayment,
  verifyPayment,
} from "@/features/booking/service";
import { BookingError } from "@/features/booking";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { addMinutes, createFixtures, nextHour, sha256Hex, type Fixtures } from "@/test/fixtures";

describe("booking service", () => {
  let fx: Fixtures;
  let start: Date;
  let end: Date;

  beforeEach(async () => {
    fx = await createFixtures();
    start = nextHour(60);
    end = addMinutes(start, 60);
  });

  afterEach(async () => {
    await fx.cleanup();
  });

  // --------------------------------------------------------------------------
  // holdSlot
  // --------------------------------------------------------------------------
  it("holdSlot creates a hold for a valid future slot", async () => {
    const hold = await holdSlot({ playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end });
    expect(hold.playerId).toBe(fx.playerId);
    expect(hold.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("holdSlot rejects past start times", async () => {
    const past = new Date(Date.now() - 60 * 60_000);
    const pastEnd = addMinutes(past, 60);
    // Snap past time to grain so we hit the "future" check, not the grain check
    past.setUTCSeconds(0, 0);
    past.setUTCMinutes(0);
    pastEnd.setUTCSeconds(0, 0);
    pastEnd.setUTCMinutes(0);
    await expect(
      holdSlot({ playerId: fx.playerId, courtId: fx.courtId, startAt: past, endAt: pastEnd }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("holdSlot rejects non-hourly grain", async () => {
    const off = new Date(start.getTime() + 5 * 60_000); // 5 minutes off-grain
    await expect(
      holdSlot({ playerId: fx.playerId, courtId: fx.courtId, startAt: off, endAt: addMinutes(off, 60) }),
    ).rejects.toBeInstanceOf(BookingError);
  });

  it("holdSlot prevents two players grabbing the same slot", async () => {
    await holdSlot({ playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end });
    // Insert a second auth/profile for the second player using fixtures? Just reuse player.
    // The EXCLUDE applies regardless of player_id.
    await expect(
      holdSlot({ playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end }),
    ).rejects.toMatchObject({ code: "slot_not_available" });
  });

  // --------------------------------------------------------------------------
  // createBooking — happy path with hold
  // --------------------------------------------------------------------------
  it("createBooking computes fees, snapshots booking fee, and creates pending_payment", async () => {
    const hold = await holdSlot({ playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end });
    const booking = await createBooking({
      playerId: fx.playerId,
      courtId: fx.courtId,
      startAt: start,
      endAt: end,
      holdId: hold.id,
    });
    expect(booking.status).toBe("pending_payment");
    expect(booking.courtFeeCentavos).toBe(20000n); // ₱200/hr * 1hr
    expect(typeof booking.systemFeeCentavos).toBe("bigint");
    expect(booking.totalCentavos).toBe(booking.courtFeeCentavos + booking.systemFeeCentavos);
    expect(booking.cancellableUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it("createBooking without hold also works (slot was free)", async () => {
    const booking = await createBooking({
      playerId: fx.playerId,
      courtId: fx.courtId,
      startAt: start,
      endAt: end,
    });
    expect(booking.status).toBe("pending_payment");
  });

  it("createBooking rejects when slot is held by someone else's hold", async () => {
    // Same player creates a hold, then tries to book a different slot referencing this hold
    const hold = await holdSlot({ playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end });
    const otherStart = addMinutes(start, 120);
    await expect(
      createBooking({
        playerId: fx.playerId,
        courtId: fx.courtId,
        startAt: otherStart,
        endAt: addMinutes(otherStart, 60),
        holdId: hold.id,
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("createBooking prevents double booking via EXCLUDE constraint", async () => {
    await createBooking({
      playerId: fx.playerId,
      courtId: fx.courtId,
      startAt: start,
      endAt: end,
    });
    await expect(
      createBooking({
        playerId: fx.playerId,
        courtId: fx.courtId,
        startAt: start,
        endAt: end,
      }),
    ).rejects.toMatchObject({ code: "slot_not_available" });
  });

  // --------------------------------------------------------------------------
  // releaseHold
  // --------------------------------------------------------------------------
  it("releaseHold deletes the hold and is idempotent", async () => {
    const hold = await holdSlot({ playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end });
    await releaseHold({ holdId: hold.id, playerId: fx.playerId });
    await releaseHold({ holdId: hold.id, playerId: fx.playerId }); // no throw
  });

  // --------------------------------------------------------------------------
  // submitPayment / verifyPayment
  // --------------------------------------------------------------------------
  it("submitPayment requires exact total match and flips booking to payment_submitted", async () => {
    const booking = await createBooking({
      playerId: fx.playerId,
      courtId: fx.courtId,
      startAt: start,
      endAt: end,
    });
    await expect(
      submitPayment({
        bookingId: booking.id,
        playerId: fx.playerId,
        receiptImagePath: "receipts/test.jpg",
        receiptHash: sha256Hex("wrong"),
        amountCentavos: booking.totalCentavos - 1n,
        gcashReferenceNumber: "1234567890",
        gcashSenderMobile: "09171234567",
      }),
    ).rejects.toMatchObject({ code: "payment_amount_mismatch" });

    const payment = await submitPayment({
      bookingId: booking.id,
      playerId: fx.playerId,
      receiptImagePath: "receipts/test.jpg",
      receiptHash: sha256Hex("ok"),
      amountCentavos: booking.totalCentavos,
      gcashReferenceNumber: "1234567890",
      gcashSenderMobile: "09171234567",
    });
    expect(payment.status).toBe("submitted");
  });

  it("verifyPayment confirms booking and writes balanced ledger entries", async () => {
    const booking = await createBooking({
      playerId: fx.playerId,
      courtId: fx.courtId,
      startAt: start,
      endAt: end,
    });
    const payment = await submitPayment({
      bookingId: booking.id,
      playerId: fx.playerId,
      receiptImagePath: "receipts/x.jpg",
      receiptHash: sha256Hex(`pay-${booking.id}`),
      amountCentavos: booking.totalCentavos,
      gcashReferenceNumber: "1234567890",
      gcashSenderMobile: "09171234567",
    });
    const verified = await verifyPayment({ paymentId: payment.id, verifierId: fx.ownerId });
    expect(verified.status).toBe("verified");

    const rows = await db.execute<{ debits: string; credits: string }>(sql`
      select
        coalesce(sum(case when direction = 'debit' then amount_centavos end), 0)::text as debits,
        coalesce(sum(case when direction = 'credit' then amount_centavos end), 0)::text as credits
      from public.ledger_entries where booking_id = ${booking.id}::uuid
    `);
    const row = rows[0];
    expect(row).toBeDefined();
    expect(row!.debits).toBe(row!.credits);
    expect(BigInt(row!.debits)).toBe(booking.totalCentavos);
  });

  it("verifyPayment rejects non-owner verifiers", async () => {
    const booking = await createBooking({
      playerId: fx.playerId,
      courtId: fx.courtId,
      startAt: start,
      endAt: end,
    });
    const payment = await submitPayment({
      bookingId: booking.id,
      playerId: fx.playerId,
      receiptImagePath: "receipts/x.jpg",
      receiptHash: sha256Hex(`auth-${booking.id}`),
      amountCentavos: booking.totalCentavos,
      gcashReferenceNumber: "1234567890",
      gcashSenderMobile: "09171234567",
    });
    await expect(
      verifyPayment({ paymentId: payment.id, verifierId: fx.playerId }),
    ).rejects.toMatchObject({ code: "not_authorized" });
  });

  it("rejectPayment flips booking back to pending_payment", async () => {
    const booking = await createBooking({
      playerId: fx.playerId,
      courtId: fx.courtId,
      startAt: start,
      endAt: end,
    });
    const payment = await submitPayment({
      bookingId: booking.id,
      playerId: fx.playerId,
      receiptImagePath: "receipts/x.jpg",
      receiptHash: sha256Hex(`rej-${booking.id}`),
      amountCentavos: booking.totalCentavos,
      gcashReferenceNumber: "1234567890",
      gcashSenderMobile: "09171234567",
    });
    const rejected = await rejectPayment({
      paymentId: payment.id,
      verifierId: fx.ownerId,
      reason: "Receipt is blurry",
    });
    expect(rejected.status).toBe("rejected");
  });

  // --------------------------------------------------------------------------
  // cancelBooking
  // --------------------------------------------------------------------------
  it("cancelBooking succeeds inside the 15-minute window", async () => {
    const booking = await createBooking({
      playerId: fx.playerId,
      courtId: fx.courtId,
      startAt: start,
      endAt: end,
    });
    const cancelled = await cancelBooking({ bookingId: booking.id, playerId: fx.playerId });
    expect(cancelled.status).toBe("cancelled");
  });

  it("cancelBooking succeeds for confirmed bookings inside the 15-minute window", async () => {
    const booking = await createBooking({
      playerId: fx.playerId,
      courtId: fx.courtId,
      startAt: start,
      endAt: end,
    });
    const payment = await submitPayment({
      bookingId: booking.id,
      playerId: fx.playerId,
      receiptImagePath: "receipts/confirmed-cancel.jpg",
      receiptHash: sha256Hex(`confirmed-cancel-${booking.id}`),
      amountCentavos: booking.totalCentavos,
      gcashReferenceNumber: "1234567890",
      gcashSenderMobile: "09171234567",
    });
    await verifyPayment({ paymentId: payment.id, verifierId: fx.ownerId });

    const cancelled = await cancelBooking({ bookingId: booking.id, playerId: fx.playerId });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledBy).toBe(fx.playerId);
    expect(cancelled.notes).toContain("[Player cancel]");
    expect(cancelled.notes).toContain("[Refund pending");
  });

  it("cancelBooking rejects after window elapses", async () => {
    const booking = await createBooking({
      playerId: fx.playerId,
      courtId: fx.courtId,
      startAt: start,
      endAt: end,
    });
    // Force the cancellable window to be in the past
    await db.execute(sql`update public.bookings set cancellable_until = now() - interval '1 minute' where id = ${booking.id}::uuid`);
    await expect(
      cancelBooking({ bookingId: booking.id, playerId: fx.playerId }),
    ).rejects.toMatchObject({ code: "booking_not_cancellable" });
  });

  it("cancelBooking rejects non-owner caller", async () => {
    const booking = await createBooking({
      playerId: fx.playerId,
      courtId: fx.courtId,
      startAt: start,
      endAt: end,
    });
    await expect(
      cancelBooking({ bookingId: booking.id, playerId: fx.ownerId }),
    ).rejects.toMatchObject({ code: "booking_not_owned" });
  });

  // --------------------------------------------------------------------------
  // Cron: expire + release
  // --------------------------------------------------------------------------
  it("expireUnpaidBookings marks past-due pending bookings as expired", async () => {
    const booking = await createBooking({
      playerId: fx.playerId,
      courtId: fx.courtId,
      startAt: start,
      endAt: end,
    });
    await db.execute(sql`update public.bookings set payment_due_at = now() - interval '1 minute' where id = ${booking.id}::uuid`);
    const result = await expireUnpaidBookings();
    expect(result.expired).toBeGreaterThanOrEqual(1);
  });

  it("releaseExpiredHolds deletes expired holds", async () => {
    const hold = await holdSlot({ playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end });
    await db.execute(sql`update public.slot_holds set expires_at = now() - interval '1 minute' where id = ${hold.id}::uuid`);
    const result = await releaseExpiredHolds();
    expect(result.released).toBeGreaterThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // Receipt auto-validation heuristics (migration 0030)
  // --------------------------------------------------------------------------

  async function submitClean(bookingId: string, total: bigint, opts?: { ref?: string; hash?: string }) {
    return submitPayment({
      bookingId,
      playerId: fx.playerId,
      receiptImagePath: "receipts/auto.jpg",
      receiptHash: opts?.hash ?? sha256Hex(`auto-${bookingId}-${Math.random()}`),
      amountCentavos: total,
      gcashReferenceNumber: opts?.ref ?? "1234567890",
    });
  }

  async function readPaymentRow(paymentId: string) {
    const rows = await db.execute<{
      auto_validated_at: Date | null;
      auto_validation_failures: string[];
      auto_confirm_at: Date | null;
      auto_confirmed_at: Date | null;
      late_confirmed_at: Date | null;
      owner_nudge1_sent_at: Date | null;
      owner_nudge2_sent_at: Date | null;
    }>(sql`
      select p.auto_validated_at, p.auto_validation_failures,
             b.auto_confirm_at,
             p.auto_confirmed_at, p.late_confirmed_at,
             p.owner_nudge1_sent_at, p.owner_nudge2_sent_at
      from public.payments p
      join public.bookings b on b.id = p.booking_id
      where p.id = ${paymentId}::uuid
    `);
    expect(rows[0]).toBeDefined();
    return rows[0]!;
  }

  it("submitPayment auto-validates a clean receipt and schedules SLA auto-confirm", async () => {
    const booking = await createBooking({
      playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end,
    });
    const payment = await submitClean(booking.id, booking.totalCentavos);
    const row = await readPaymentRow(payment.id);
    expect(row.auto_validated_at).not.toBeNull();
    expect(row.auto_validation_failures).toEqual([]);
    expect(row.auto_confirm_at).not.toBeNull();
    // Scheduled for T-30m relative to start_at
    const expected = new Date(start.getTime() - 30 * 60_000).getTime();
    expect(row.auto_confirm_at!.getTime()).toBe(expected);
  });

  it("submitPayment records ref_format failure for non-numeric reference", async () => {
    const booking = await createBooking({
      playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end,
    });
    const payment = await submitClean(booking.id, booking.totalCentavos, { ref: "ABC-not-numeric" });
    const row = await readPaymentRow(payment.id);
    expect(row.auto_validated_at).toBeNull();
    expect(row.auto_validation_failures).toContain("ref_format");
    expect(row.auto_confirm_at).toBeNull();
  });

  it("submitPayment records ref_duplicate when the same GCash ref is reused", async () => {
    const b1 = await createBooking({
      playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end,
    });
    await submitClean(b1.id, b1.totalCentavos, { ref: "9999888877" });

    const start2 = addMinutes(start, 120);
    const b2 = await createBooking({
      playerId: fx.playerId, courtId: fx.courtId, startAt: start2, endAt: addMinutes(start2, 60),
    });
    const p2 = await submitClean(b2.id, b2.totalCentavos, { ref: "9999888877" });
    const row = await readPaymentRow(p2.id);
    expect(row.auto_validation_failures).toContain("ref_duplicate");
  });

  it("submitPayment records hash_replay when the same receipt hash is reused", async () => {
    const sharedHash = sha256Hex("shared-replay");
    const b1 = await createBooking({
      playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end,
    });
    await submitClean(b1.id, b1.totalCentavos, { ref: "1111222233", hash: sharedHash });

    const start2 = addMinutes(start, 120);
    const b2 = await createBooking({
      playerId: fx.playerId, courtId: fx.courtId, startAt: start2, endAt: addMinutes(start2, 60),
    });
    const p2 = await submitClean(b2.id, b2.totalCentavos, { ref: "4444555566", hash: sharedHash });
    const row = await readPaymentRow(p2.id);
    expect(row.auto_validation_failures).toContain("hash_replay");
  });

  it("submitPayment skips auto_confirm_at when session start is too close", async () => {
    // Booking starts soon — within the 10-minute minimum lead time before auto-confirm.
    const nearStart = nextHour(60);
    const booking = await createBooking({
      playerId: fx.playerId, courtId: fx.courtId, startAt: nearStart, endAt: addMinutes(nearStart, 60),
    });
    // Move start to be ~20m in the future (so auto_confirm would be T-30m = past).
    await db.execute(sql`
      update public.bookings
         set start_at = now() + interval '20 minutes',
             end_at = now() + interval '80 minutes'
       where id = ${booking.id}::uuid
    `);
    const payment = await submitClean(booking.id, booking.totalCentavos);
    const row = await readPaymentRow(payment.id);
    expect(row.auto_validated_at).not.toBeNull();
    expect(row.auto_confirm_at).toBeNull();
  });

  it("autoConfirmEligibleBookings confirms only payments past their SLA with auto_validated_at set", async () => {
    const booking = await createBooking({
      playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end,
    });
    const payment = await submitClean(booking.id, booking.totalCentavos);
    // Force the SLA deadline into the past.
    await db.execute(sql`
      update public.bookings set auto_confirm_at = now() - interval '1 minute'
       where id = ${booking.id}::uuid
    `);
    const before = await autoConfirmEligibleBookings();
    expect(before.confirmed).toBeGreaterThanOrEqual(1);

    const row = await readPaymentRow(payment.id);
    expect(row.auto_confirmed_at).not.toBeNull();

    // Ledger must be balanced for the auto-confirmed booking.
    const ledger = await db.execute<{ debits: string; credits: string }>(sql`
      select coalesce(sum(case when direction='debit' then amount_centavos end),0)::text as debits,
             coalesce(sum(case when direction='credit' then amount_centavos end),0)::text as credits
        from public.ledger_entries where booking_id = ${booking.id}::uuid
    `);
    expect(ledger[0]!.debits).toBe(ledger[0]!.credits);
    expect(BigInt(ledger[0]!.debits)).toBe(booking.totalCentavos);
  });

  it("autoConfirmEligibleBookings skips bookings whose payment was not auto-validated", async () => {
    const booking = await createBooking({
      playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end,
    });
    // Submit with bad ref so auto_validated_at stays NULL.
    await submitClean(booking.id, booking.totalCentavos, { ref: "BAD-REF-NOT-NUMERIC" });
    // Manually set an auto_confirm_at in the past just to be sure the filter rejects.
    await db.execute(sql`
      update public.bookings set auto_confirm_at = now() - interval '1 minute'
       where id = ${booking.id}::uuid
    `);
    const result = await autoConfirmEligibleBookings();
    expect(result.confirmed).toBe(0);
  });

  it("lateConfirmPayment refuses to run before the session ends", async () => {
    const booking = await createBooking({
      playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end,
    });
    const payment = await submitClean(booking.id, booking.totalCentavos);
    await expect(
      lateConfirmPayment({ paymentId: payment.id, adminId: fx.ownerId, reason: "test" }),
    ).rejects.toMatchObject({ code: "booking_wrong_status" });
  });

  it("sendOwnerVerificationNudges is idempotent — same payment is not nudged twice", async () => {
    const booking = await createBooking({
      playerId: fx.playerId, courtId: fx.courtId, startAt: start, endAt: end,
    });
    const payment = await submitClean(booking.id, booking.totalCentavos);
    // Backdate submission so it qualifies for nudge 1 (≥ 2 hours old).
    await db.execute(sql`
      update public.payments set submitted_at = now() - interval '3 hours'
       where id = ${payment.id}::uuid
    `);
    const first = await sendOwnerVerificationNudges();
    expect(first.nudge1).toBeGreaterThanOrEqual(1);

    const second = await sendOwnerVerificationNudges();
    expect(second.nudge1).toBe(0);

    const row = await readPaymentRow(payment.id);
    expect(row.owner_nudge1_sent_at).not.toBeNull();
  });
});

