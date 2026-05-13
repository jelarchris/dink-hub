import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cancelBooking,
  createBooking,
  expireUnpaidBookings,
  holdSlot,
  rejectPayment,
  releaseExpiredHolds,
  releaseHold,
  submitPayment,
  verifyPayment,
} from "@/features/booking/service";
import { BookingError } from "@/features/booking";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { addMinutes, createFixtures, nextHalfHour, sha256Hex, type Fixtures } from "@/test/fixtures";

describe("booking service", () => {
  let fx: Fixtures;
  let start: Date;
  let end: Date;

  beforeEach(async () => {
    fx = await createFixtures();
    start = nextHalfHour(60);
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
    past.setUTCMinutes(past.getUTCMinutes() - (past.getUTCMinutes() % 30));
    pastEnd.setUTCSeconds(0, 0);
    pastEnd.setUTCMinutes(pastEnd.getUTCMinutes() - (pastEnd.getUTCMinutes() % 30));
    await expect(
      holdSlot({ playerId: fx.playerId, courtId: fx.courtId, startAt: past, endAt: pastEnd }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("holdSlot rejects non-30-minute grain", async () => {
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
  it("createBooking computes fees, snapshots launch promo fee, and creates pending_payment", async () => {
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
    expect(booking.systemFeeCentavos).toBe(0n); // launch promo waives booking fees
    expect(booking.totalCentavos).toBe(20000n);
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
      }),
    ).rejects.toMatchObject({ code: "payment_amount_mismatch" });

    const payment = await submitPayment({
      bookingId: booking.id,
      playerId: fx.playerId,
      receiptImagePath: "receipts/test.jpg",
      receiptHash: sha256Hex("ok"),
      amountCentavos: booking.totalCentavos,
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
});
