import "server-only";
import { type DB } from "@/db/client";
import * as repo from "./repo";
import { VoucherError } from "./errors";
import type { Voucher } from "@/db/schema";

type Tx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

export interface ValidatedVoucher {
  voucher: Voucher;
  /**
   * Centavos to subtract from the base system fee. Always between 0 and
   * `baseSystemFeeCentavos` (capped — a flat code worth ₱30 against a ₱20 fee
   * caps the discount at ₱20, never produces a negative fee or a credit).
   */
  discountCentavos: bigint;
  /** Resulting system fee after discount. */
  discountedSystemFeeCentavos: bigint;
}

interface ValidateArgs {
  code: string;
  userId: string;
  courtFeeCentavos: bigint;
  baseSystemFeeCentavos: bigint;
  /** Venue the booking belongs to. Used to enforce venue-scoped vouchers. */
  venueId: string;
  /** Optional — when provided, also checks per-user redemption cap. */
  tx?: Tx;
}

/**
 * Pure validation — no side effects. Used by both the preview endpoint (player
 * clicks "Apply") and the booking transaction (server-side re-check).
 */
export async function validateVoucherForBooking(
  args: ValidateArgs,
): Promise<ValidatedVoucher> {
  const code = args.code.trim();
  if (!code) throw new VoucherError("invalid_code", "Enter a voucher code");

  const voucher = await repo.findVoucherByCode(code);
  if (!voucher) {
    throw new VoucherError("not_found", "Voucher code not found");
  }
  if (voucher.status !== "active") {
    throw new VoucherError("inactive", "This voucher is no longer active");
  }

  const now = new Date();
  if (voucher.validFrom > now) {
    throw new VoucherError("not_yet_valid", "This voucher is not yet valid");
  }
  if (voucher.validUntil && voucher.validUntil <= now) {
    throw new VoucherError("expired", "This voucher has expired");
  }

  if (voucher.venueId !== null && voucher.venueId !== args.venueId) {
    throw new VoucherError(
      "wrong_venue",
      "This voucher is not valid at this venue",
    );
  }

  if (
    voucher.maxRedemptions !== null &&
    voucher.redemptionCount >= voucher.maxRedemptions
  ) {
    throw new VoucherError("fully_redeemed", "This voucher has been fully redeemed");
  }

  if (args.courtFeeCentavos < voucher.minCourtFeeCentavos) {
    throw new VoucherError(
      "below_minimum",
      `Booking must be at least ₱${(Number(voucher.minCourtFeeCentavos) / 100).toFixed(2)} to use this code`,
    );
  }

  if (args.tx && voucher.maxPerUser > 0) {
    const used = await repo.countUserRedemptions(args.tx, voucher.id, args.userId);
    if (used >= voucher.maxPerUser) {
      throw new VoucherError(
        "user_limit_reached",
        voucher.maxPerUser === 1
          ? "You've already used this code"
          : `You've reached the limit for this code (${voucher.maxPerUser} uses)`,
      );
    }
  }

  // Compute discount, capped at the base system fee.
  let discount: bigint;
  if (voucher.discountType === "percent") {
    // discountValue stored as bigint but always 1..100 — safe to use as integer.
    const pct = Number(voucher.discountValue);
    discount = (args.baseSystemFeeCentavos * BigInt(pct)) / 100n;
  } else {
    discount = voucher.discountValue;
  }
  if (discount > args.baseSystemFeeCentavos) {
    discount = args.baseSystemFeeCentavos;
  }
  if (discount < 0n) discount = 0n;

  return {
    voucher,
    discountCentavos: discount,
    discountedSystemFeeCentavos: args.baseSystemFeeCentavos - discount,
  };
}

/**
 * Apply a voucher inside an open booking transaction. Increments the
 * voucher's redemption_count atomically (rolls back booking on cap hit) and
 * inserts the redemption row.
 *
 * Returns the discount that was actually applied so the caller can snapshot
 * it onto the booking row.
 */
export async function applyVoucherInTransaction(
  tx: Tx,
  args: {
    validated: ValidatedVoucher;
    bookingId: string;
    userId: string;
  },
): Promise<void> {
  const { validated, bookingId, userId } = args;
  const newCount = await repo.tryIncrementVoucherRedemption(tx, validated.voucher.id);
  if (newCount === null) {
    throw new VoucherError(
      "fully_redeemed",
      "This voucher was just fully redeemed by another booking",
    );
  }
  await repo.insertRedemption(tx, {
    voucherId: validated.voucher.id,
    bookingId,
    userId,
    discountAppliedCentavos: validated.discountCentavos,
  });
}

export { repo as vouchersRepo };
