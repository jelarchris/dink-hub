import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bookings,
  ledgerEntries,
  payments,
  type NewLedgerEntry,
  type Payment,
  type Profile,
} from "@/db/schema";
import { recordAudit } from "./audit";
import { AdminError } from "./errors";
import type {
  OpenDisputeInput,
  ResolveDisputeInput,
} from "./schema";

// ----------------------------------------------------------------------------
// Open a dispute on a verified payment.
// Booking stays 'confirmed' until resolution; payment status -> 'disputed'.
// ----------------------------------------------------------------------------
export async function openDispute(
  admin: Profile,
  input: OpenDisputeInput,
): Promise<Payment> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, input.paymentId))
      .limit(1);
    const p = rows[0];
    if (!p) throw new AdminError("payment_not_found", "Payment not found.");
    if (p.version !== input.expectedVersion) {
      throw new AdminError(
        "version_conflict",
        "Payment was changed in another tab. Reload to see the latest.",
      );
    }
    if (p.status !== "verified") {
      throw new AdminError(
        "invalid_status_transition",
        `Can only dispute a verified payment (current: "${p.status}").`,
      );
    }

    const [updated] = await tx
      .update(payments)
      .set({
        status: "disputed",
        disputeReason: input.reason,
        disputeOpenedAt: new Date(),
        disputeOpenedBy: admin.id,
        version: p.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, p.id), eq(payments.version, p.version)))
      .returning();
    if (!updated) {
      throw new AdminError(
        "version_conflict",
        "Payment was changed in another tab. Reload to see the latest.",
      );
    }

    await recordAudit({
      actor: admin,
      action: "payment.dispute.open",
      targetType: "payment",
      targetId: updated.id,
      before: { status: p.status, dispute_reason: p.disputeReason },
      after: { status: updated.status, dispute_reason: updated.disputeReason },
      reason: input.reason,
    });

    return updated;
  });
}

// ----------------------------------------------------------------------------
// Resolve an open dispute.
//   resolution = 'refund_full' → booking.status = 'refunded',
//                payment.status = 'rejected', writes reversal ledger entries
//                (mirrors verifyPayment but with debits/credits flipped).
//   resolution = 'rejected'    → payment returns to 'verified', booking unchanged.
// Reversal is idempotent via dispute-scoped idempotency keys.
// ----------------------------------------------------------------------------
export async function resolveDispute(
  admin: Profile,
  input: ResolveDisputeInput,
): Promise<Payment> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, input.paymentId))
      .limit(1);
    const p = rows[0];
    if (!p) throw new AdminError("payment_not_found", "Payment not found.");
    if (p.version !== input.expectedVersion) {
      throw new AdminError(
        "version_conflict",
        "Payment was changed in another tab. Reload to see the latest.",
      );
    }
    if (p.status !== "disputed") {
      throw new AdminError(
        "invalid_status_transition",
        `Can only resolve a disputed payment (current: "${p.status}").`,
      );
    }

    const bookingRows = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, p.bookingId))
      .limit(1);
    const b = bookingRows[0];
    if (!b) throw new AdminError("venue_not_found", "Booking not found.");

    const now = new Date();
    const [updated] = await tx
      .update(payments)
      .set({
        status: input.resolution === "refund_full" ? "rejected" : "verified",
        disputeResolution: input.resolution,
        disputeResolvedAt: now,
        disputeResolvedBy: admin.id,
        rejectionReason:
          input.resolution === "refund_full"
            ? `Dispute refund: ${input.notes ?? p.disputeReason ?? "no reason recorded"}`
            : p.rejectionReason,
        version: p.version + 1,
        updatedAt: now,
      })
      .where(and(eq(payments.id, p.id), eq(payments.version, p.version)))
      .returning();
    if (!updated) {
      throw new AdminError(
        "version_conflict",
        "Payment was changed in another tab. Reload to see the latest.",
      );
    }

    if (input.resolution === "refund_full") {
      const refundedBooking = await tx
        .update(bookings)
        .set({
          status: "refunded",
          notes: b.notes
            ? `${b.notes}\n\n[Dispute refund] ${input.notes ?? p.disputeReason ?? ""}`
            : `[Dispute refund] ${input.notes ?? p.disputeReason ?? ""}`,
          version: b.version + 1,
          updatedAt: now,
        })
        .where(and(eq(bookings.id, b.id), eq(bookings.version, b.version)))
        .returning();
      if (refundedBooking.length === 0) {
        throw new AdminError(
          "version_conflict",
          "Booking was modified concurrently.",
        );
      }

      // Reversal entries — mirror the verifyPayment writes with directions flipped.
      // Sum of debits === sum of credits === total_centavos.
      const reversal: NewLedgerEntry[] = [
        {
          bookingId: b.id,
          account: "venue_payable" as const,
          direction: "debit" as const,
          amountCentavos: b.courtFeeCentavos,
          description: `Reverse court fee owed to venue (refund booking ${b.id})`,
          idempotencyKey: `bk:${b.id}:reverse:venue_payable`,
          createdBy: admin.id,
        },
        {
          bookingId: b.id,
          account: "platform_revenue" as const,
          direction: "debit" as const,
          amountCentavos: b.systemFeeCentavos,
          description: `Reverse system fee revenue (refund booking ${b.id})`,
          idempotencyKey: `bk:${b.id}:reverse:platform_revenue`,
          createdBy: admin.id,
        },
        {
          bookingId: b.id,
          account: "platform_cash" as const,
          direction: "credit" as const,
          amountCentavos: b.totalCentavos,
          description: `Cash returned to player (refund booking ${b.id})`,
          idempotencyKey: `bk:${b.id}:reverse:platform_cash`,
          createdBy: admin.id,
        },
      ].filter((e) => e.amountCentavos > 0n);

      if (reversal.length > 0) {
        await tx.insert(ledgerEntries).values(reversal);
      }
    }

    await recordAudit({
      actor: admin,
      action: `payment.dispute.${input.resolution}`,
      targetType: "payment",
      targetId: updated.id,
      before: { status: p.status, dispute_resolution: p.disputeResolution },
      after: { status: updated.status, dispute_resolution: updated.disputeResolution },
      reason: input.notes,
    });

    return updated;
  });
}
