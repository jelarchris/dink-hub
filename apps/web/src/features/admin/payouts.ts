import "server-only";
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bookings,
  ledgerEntries,
  profiles,
  venuePayouts,
  venues,
  type LedgerEntry,
  type NewLedgerEntry,
  type Profile,
  type VenuePayout,
} from "@/db/schema";
import { recordAudit } from "./audit";
import { AdminError } from "./errors";
import {
  PAGE_SIZE,
  type GeneratePayoutInput,
  type MarkPayoutPaidInput,
  type PayoutListFilter,
  type TogglePayoutHoldInput,
} from "./schema";

export interface AdminPayoutRow {
  payout: VenuePayout;
  venueName: string;
  ownerEmail: string;
}

export interface PagedPayouts {
  rows: ReadonlyArray<AdminPayoutRow>;
  total: number;
  page: number;
  pageSize: number;
}

export async function listPayouts(filter: PayoutListFilter): Promise<PagedPayouts> {
  const wheres = [];
  if (filter.status !== "all") wheres.push(eq(venuePayouts.status, filter.status));
  if (filter.venueId) wheres.push(eq(venuePayouts.venueId, filter.venueId));
  const where = wheres.length > 0 ? and(...wheres) : undefined;

  const base = db
    .select({
      payout: venuePayouts,
      venueName: venues.name,
      ownerEmail: profiles.email,
    })
    .from(venuePayouts)
    .innerJoin(venues, eq(venues.id, venuePayouts.venueId))
    .innerJoin(profiles, eq(profiles.id, venues.ownerId));

  const countBase = db
    .select({ n: count() })
    .from(venuePayouts);

  const [rows, [c]] = await Promise.all([
    (where ? base.where(where) : base)
      .orderBy(desc(venuePayouts.periodEnd), desc(venuePayouts.createdAt))
      .limit(PAGE_SIZE)
      .offset((filter.page - 1) * PAGE_SIZE),
    where ? countBase.where(where) : countBase,
  ]);

  return { rows, total: c?.n ?? 0, page: filter.page, pageSize: PAGE_SIZE };
}

export interface AdminPayoutDetail {
  payout: VenuePayout;
  venueName: string;
  venueId: string;
  ownerEmail: string;
  ownerName: string;
  ledger: ReadonlyArray<LedgerEntry>;
}

export async function getPayoutDetail(payoutId: string): Promise<AdminPayoutDetail> {
  const rows = await db
    .select({
      payout: venuePayouts,
      venueId: venues.id,
      venueName: venues.name,
      ownerEmail: profiles.email,
      ownerName: profiles.displayName,
    })
    .from(venuePayouts)
    .innerJoin(venues, eq(venues.id, venuePayouts.venueId))
    .innerJoin(profiles, eq(profiles.id, venues.ownerId))
    .where(eq(venuePayouts.id, payoutId))
    .limit(1);
  const r = rows[0];
  if (!r) throw new AdminError("payout_not_found", "Payout not found.");

  const ledger = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.payoutId, payoutId))
    .orderBy(ledgerEntries.createdAt);

  return { ...r, ledger };
}

// ----------------------------------------------------------------------------
// Aggregate confirmed bookings into a payout for one venue + period.
// Period uses [start, end) on booking.start_at. Refuses overlap with existing
// payout for the same venue.
// ----------------------------------------------------------------------------
export async function generatePayout(
  admin: Profile,
  input: GeneratePayoutInput,
): Promise<VenuePayout> {
  const periodStart = new Date(`${input.periodStart}T00:00:00.000Z`);
  const periodEnd = new Date(`${input.periodEnd}T00:00:00.000Z`);

  if (Number.isNaN(periodStart.valueOf()) || Number.isNaN(periodEnd.valueOf())) {
    throw new AdminError("validation", "Invalid date range.");
  }
  if (periodEnd > new Date()) {
    throw new AdminError("validation", "Period end must be in the past.");
  }

  return db.transaction(async (tx) => {
    const venueRows = await tx
      .select({ id: venues.id, name: venues.name })
      .from(venues)
      .where(eq(venues.id, input.venueId))
      .limit(1);
    if (!venueRows[0]) throw new AdminError("venue_not_found", "Venue not found.");

    // Refuse overlapping payout windows (same venue).
    const overlap = await tx
      .select({ id: venuePayouts.id })
      .from(venuePayouts)
      .where(
        and(
          eq(venuePayouts.venueId, input.venueId),
          lt(venuePayouts.periodStart, periodEnd),
          // existing.periodEnd > newStart
          sql`${venuePayouts.periodEnd} > ${periodStart}`,
        ),
      )
      .limit(1);
    if (overlap[0]) {
      throw new AdminError(
        "payout_overlap",
        "A payout already exists overlapping this period for this venue.",
      );
    }

    const aggRows = await tx
      .select({
        n: count(),
        gross: sql<string>`coalesce(sum(${bookings.courtFeeCentavos}), 0)`.mapWith(String),
        fees: sql<string>`coalesce(sum(${bookings.systemFeeCentavos}), 0)`.mapWith(String),
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.venueId, input.venueId),
          eq(bookings.status, "confirmed"),
          gte(bookings.startAt, periodStart),
          lt(bookings.startAt, periodEnd),
        ),
      );
    const agg = aggRows[0];
    if (!agg || agg.n === 0) {
      throw new AdminError(
        "no_bookings",
        "No confirmed bookings in this period for this venue.",
      );
    }

    const gross = BigInt(agg.gross);
    const fees = BigInt(agg.fees);
    const net = gross - fees;

    const [created] = await tx
      .insert(venuePayouts)
      .values({
        venueId: input.venueId,
        periodStart,
        periodEnd,
        grossCentavos: gross,
        feesCentavos: fees,
        netCentavos: net,
        carryoverCentavos: 0n,
        bookingCount: agg.n,
        status: "pending",
        notes: input.notes,
      })
      .returning();
    if (!created) throw new AdminError("unknown", "Failed to create payout.");

    await recordAudit({
      actor: admin,
      action: "payout.generate",
      targetType: "payout",
      targetId: created.id,
      before: null,
      after: {
        venue_id: created.venueId,
        period_start: created.periodStart,
        period_end: created.periodEnd,
        gross_centavos: created.grossCentavos.toString(),
        fees_centavos: created.feesCentavos.toString(),
        net_centavos: created.netCentavos.toString(),
        booking_count: created.bookingCount,
      },
      reason: input.notes,
    });

    return created;
  });
}

// ----------------------------------------------------------------------------
// Mark payout paid: writes balanced settlement entries (clears venue_payable).
//   D venue_payable / C platform_cash, amount = gross
// Idempotency keys are derived from payoutId so the entry insert is replay-safe.
// ----------------------------------------------------------------------------
export async function markPayoutPaid(
  admin: Profile,
  input: MarkPayoutPaidInput,
): Promise<VenuePayout> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(venuePayouts)
      .where(eq(venuePayouts.id, input.payoutId))
      .limit(1);
    const p = rows[0];
    if (!p) throw new AdminError("payout_not_found", "Payout not found.");
    if (p.version !== input.expectedVersion) {
      throw new AdminError(
        "version_conflict",
        "Payout was changed in another tab. Reload to see the latest.",
      );
    }
    if (p.status !== "pending" && p.status !== "processing") {
      throw new AdminError(
        "invalid_status_transition",
        `Cannot mark a payout in status "${p.status}" as paid.`,
      );
    }

    const [updated] = await tx
      .update(venuePayouts)
      .set({
        status: "paid",
        paidAt: new Date(),
        paidReference: input.paidReference,
        notes: input.notes ?? p.notes,
        version: p.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(venuePayouts.id, p.id), eq(venuePayouts.version, p.version)))
      .returning();
    if (!updated) {
      throw new AdminError(
        "version_conflict",
        "Payout was changed in another tab. Reload to see the latest.",
      );
    }

    if (updated.grossCentavos > 0n) {
      const entries: NewLedgerEntry[] = [
        {
          payoutId: updated.id,
          account: "venue_payable",
          direction: "debit",
          amountCentavos: updated.grossCentavos,
          description: `Settlement to venue ${p.venueId} (clears liability)`,
          idempotencyKey: `payout:${updated.id}:venue_payable_clear`,
          createdBy: admin.id,
        },
        {
          payoutId: updated.id,
          account: "platform_cash",
          direction: "credit",
          amountCentavos: updated.grossCentavos,
          description: `Settlement to venue ${p.venueId} (cash out)`,
          idempotencyKey: `payout:${updated.id}:platform_cash_out`,
          createdBy: admin.id,
        },
      ];
      await tx.insert(ledgerEntries).values(entries);
    }

    await recordAudit({
      actor: admin,
      action: "payout.mark_paid",
      targetType: "payout",
      targetId: updated.id,
      before: { status: p.status, paid_reference: p.paidReference },
      after: { status: updated.status, paid_reference: updated.paidReference },
      reason: input.notes,
    });

    return updated;
  });
}

// ----------------------------------------------------------------------------
// Toggle on_hold ↔ pending. No ledger writes; metadata only.
// ----------------------------------------------------------------------------
export async function togglePayoutHold(
  admin: Profile,
  input: TogglePayoutHoldInput,
): Promise<VenuePayout> {
  const rows = await db
    .select()
    .from(venuePayouts)
    .where(eq(venuePayouts.id, input.payoutId))
    .limit(1);
  const p = rows[0];
  if (!p) throw new AdminError("payout_not_found", "Payout not found.");
  if (p.version !== input.expectedVersion) {
    throw new AdminError(
      "version_conflict",
      "Payout was changed in another tab. Reload to see the latest.",
    );
  }

  const wantStatus = input.action === "hold" ? "on_hold" : "pending";
  if (input.action === "hold" && p.status !== "pending") {
    throw new AdminError(
      "invalid_status_transition",
      `Can only put pending payouts on hold (current: "${p.status}").`,
    );
  }
  if (input.action === "release" && p.status !== "on_hold") {
    throw new AdminError(
      "invalid_status_transition",
      `Can only release on-hold payouts (current: "${p.status}").`,
    );
  }
  if (input.action === "hold" && (!input.reason || input.reason.length < 3)) {
    throw new AdminError("validation", "A reason is required when placing on hold.");
  }

  const [updated] = await db
    .update(venuePayouts)
    .set({
      status: wantStatus,
      notes: input.action === "hold" ? input.reason : p.notes,
      version: p.version + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(venuePayouts.id, p.id), eq(venuePayouts.version, p.version)))
    .returning();
  if (!updated) {
    throw new AdminError(
      "version_conflict",
      "Payout was changed in another tab. Reload to see the latest.",
    );
  }

  await recordAudit({
    actor: admin,
    action: `payout.${input.action}`,
    targetType: "payout",
    targetId: updated.id,
    before: { status: p.status },
    after: { status: updated.status },
    reason: input.reason,
  });

  return updated;
}

// ----------------------------------------------------------------------------
// Helper: list venues that have confirmed bookings without an existing payout.
// Used by the "Generate payout" form.
// ----------------------------------------------------------------------------
export async function listVenuesEligibleForPayout(): Promise<
  ReadonlyArray<{ id: string; name: string; ownerEmail: string }>
> {
  return db
    .select({
      id: venues.id,
      name: venues.name,
      ownerEmail: profiles.email,
    })
    .from(venues)
    .innerJoin(profiles, eq(profiles.id, venues.ownerId))
    .where(eq(venues.status, "active"))
    .orderBy(venues.name)
    .limit(200);
}
