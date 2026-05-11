import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  ledgerEntries,
  ownerInvoices,
  profiles,
  venues,
  type LedgerEntry,
  type NewLedgerEntry,
  type OwnerInvoice,
  type Profile,
  type Venue,
} from "@/db/schema";
import { recordAudit } from "./audit";
import { AdminError } from "./errors";
import {
  PAGE_SIZE,
  type OwnerInvoiceListFilter,
  type RejectOwnerInvoiceInput,
  type VerifyOwnerInvoiceInput,
  type VoidOwnerInvoiceInput,
} from "./schema";

/**
 * Admin verification queue for weekly DinkHub owner invoices.
 *
 * The owner uploads a GCash receipt via `/owner/invoices/[id]` → status flips
 * to `submitted`. Admin reviews here and either:
 *   - verifies   → status `verified`, balanced ledger pair written
 *   - rejects    → status `rejected`, reason recorded, owner can resubmit
 *
 * Ledger accounting (on verify):
 *   D platform_cash     amount = total_centavos   (real cash received)
 *   C venue_payable     amount = total_centavos   (offsets the fee portion
 *                                                  of liability accrued at
 *                                                  booking confirmation)
 *
 * Idempotency: per-invoice keys make re-running the verify path a no-op at
 * the ledger layer; the status guard + version check make it a no-op at the
 * invoice layer. Two independent safety nets.
 */

export interface AdminOwnerInvoiceRow {
  invoice: OwnerInvoice;
  venueId: string;
  venueName: string;
  ownerEmail: string;
  ownerName: string;
}

export interface PagedOwnerInvoices {
  rows: ReadonlyArray<AdminOwnerInvoiceRow>;
  total: number;
  page: number;
  pageSize: number;
}

export async function listAdminOwnerInvoices(
  filter: OwnerInvoiceListFilter,
): Promise<PagedOwnerInvoices> {
  const wheres = [sql`${venues.deletedAt} is null`];
  if (filter.status !== "all") {
    wheres.push(eq(ownerInvoices.status, filter.status));
  }
  if (filter.venueId) wheres.push(eq(ownerInvoices.venueId, filter.venueId));
  const where = and(...wheres);

  const baseSelect = db
    .select({
      invoice: ownerInvoices,
      venueId: venues.id,
      venueName: venues.name,
      ownerEmail: profiles.email,
      ownerName: profiles.displayName,
    })
    .from(ownerInvoices)
    .innerJoin(venues, eq(venues.id, ownerInvoices.venueId))
    .innerJoin(profiles, eq(profiles.id, venues.ownerId));

  const countSelect = db
    .select({ n: count() })
    .from(ownerInvoices)
    .innerJoin(venues, eq(venues.id, ownerInvoices.venueId));

  // Submitted invoices first (oldest first — FIFO queue), then everything else
  // by most recent period. This puts the actual workload at the top.
  const [rows, [c]] = await Promise.all([
    baseSelect
      .where(where)
      .orderBy(
        sql`case when ${ownerInvoices.status} = 'submitted' then 0 else 1 end`,
        sql`case when ${ownerInvoices.status} = 'submitted' then ${ownerInvoices.submittedAt} end asc nulls last`,
        desc(ownerInvoices.periodStart),
      )
      .limit(PAGE_SIZE)
      .offset((filter.page - 1) * PAGE_SIZE),
    countSelect.where(where),
  ]);

  return { rows, total: c?.n ?? 0, page: filter.page, pageSize: PAGE_SIZE };
}

export interface AdminOwnerInvoiceDetail {
  invoice: OwnerInvoice;
  venue: Venue;
  owner: Profile;
  submittedByEmail: string | null;
  ledger: ReadonlyArray<LedgerEntry>;
}

export async function getAdminOwnerInvoiceDetail(
  invoiceId: string,
): Promise<AdminOwnerInvoiceDetail> {
  const rows = await db
    .select({ invoice: ownerInvoices, venue: venues, owner: profiles })
    .from(ownerInvoices)
    .innerJoin(venues, eq(venues.id, ownerInvoices.venueId))
    .innerJoin(profiles, eq(profiles.id, venues.ownerId))
    .where(eq(ownerInvoices.id, invoiceId))
    .limit(1);
  const r = rows[0];
  if (!r) throw new AdminError("invoice_not_found", "Invoice not found.");

  let submittedByEmail: string | null = null;
  if (r.invoice.submittedBy) {
    const sb = await db
      .select({ email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, r.invoice.submittedBy))
      .limit(1);
    submittedByEmail = sb[0]?.email ?? null;
  }

  const ledger = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.ownerInvoiceId, invoiceId))
    .orderBy(ledgerEntries.createdAt);

  return {
    invoice: r.invoice,
    venue: r.venue,
    owner: r.owner,
    submittedByEmail,
    ledger,
  };
}

// ============================================================================
// verify
// ============================================================================
export async function verifyOwnerInvoice(
  admin: Profile,
  input: VerifyOwnerInvoiceInput,
): Promise<OwnerInvoice> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(ownerInvoices)
      .where(eq(ownerInvoices.id, input.invoiceId))
      .limit(1);
    const inv = rows[0];
    if (!inv) throw new AdminError("invoice_not_found", "Invoice not found.");
    if (inv.version !== input.expectedVersion) {
      throw new AdminError(
        "version_conflict",
        "Invoice was changed in another tab. Reload to see the latest.",
      );
    }
    if (inv.status !== "submitted") {
      throw new AdminError(
        "invalid_status_transition",
        `Cannot verify an invoice in status "${inv.status}".`,
      );
    }

    const [updated] = await tx
      .update(ownerInvoices)
      .set({
        status: "verified",
        verifiedAt: new Date(),
        verifiedBy: admin.id,
        rejectionReason: null,
        version: inv.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ownerInvoices.id, inv.id),
          eq(ownerInvoices.version, inv.version),
          eq(ownerInvoices.status, "submitted"),
        ),
      )
      .returning();
    if (!updated) {
      throw new AdminError(
        "version_conflict",
        "Invoice was changed in another tab. Reload to see the latest.",
      );
    }

    if (updated.totalCentavos > 0n) {
      const entries: NewLedgerEntry[] = [
        {
          ownerInvoiceId: updated.id,
          account: "platform_cash",
          direction: "debit",
          amountCentavos: updated.totalCentavos,
          description: `Owner invoice ${updated.id} paid by venue ${updated.venueId}`,
          idempotencyKey: `owner_invoice:${updated.id}:platform_cash`,
          createdBy: admin.id,
        },
        {
          ownerInvoiceId: updated.id,
          account: "venue_payable",
          direction: "credit",
          amountCentavos: updated.totalCentavos,
          description: `Owner invoice ${updated.id} settles booking-fee receivable from venue ${updated.venueId}`,
          idempotencyKey: `owner_invoice:${updated.id}:venue_payable`,
          createdBy: admin.id,
        },
      ];
      await tx.insert(ledgerEntries).values(entries);
    }

    await recordAudit({
      actor: admin,
      action: "owner_invoice.verify",
      targetType: "owner_invoice",
      targetId: updated.id,
      before: { status: inv.status, version: inv.version },
      after: {
        status: updated.status,
        version: updated.version,
        verified_at: updated.verifiedAt,
        total_centavos: updated.totalCentavos.toString(),
        gcash_reference_number: updated.gcashReferenceNumber,
      },
      reason: input.notes,
    });

    return updated;
  });
}

// ============================================================================
// reject
// ============================================================================
export async function rejectOwnerInvoice(
  admin: Profile,
  input: RejectOwnerInvoiceInput,
): Promise<OwnerInvoice> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(ownerInvoices)
      .where(eq(ownerInvoices.id, input.invoiceId))
      .limit(1);
    const inv = rows[0];
    if (!inv) throw new AdminError("invoice_not_found", "Invoice not found.");
    if (inv.version !== input.expectedVersion) {
      throw new AdminError(
        "version_conflict",
        "Invoice was changed in another tab. Reload to see the latest.",
      );
    }
    if (inv.status !== "submitted") {
      throw new AdminError(
        "invalid_status_transition",
        `Cannot reject an invoice in status "${inv.status}".`,
      );
    }

    const [updated] = await tx
      .update(ownerInvoices)
      .set({
        status: "rejected",
        rejectionReason: input.reason,
        // Clear verification fields in case this was a re-review.
        verifiedAt: null,
        verifiedBy: null,
        version: inv.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ownerInvoices.id, inv.id),
          eq(ownerInvoices.version, inv.version),
          eq(ownerInvoices.status, "submitted"),
        ),
      )
      .returning();
    if (!updated) {
      throw new AdminError(
        "version_conflict",
        "Invoice was changed in another tab. Reload to see the latest.",
      );
    }

    await recordAudit({
      actor: admin,
      action: "owner_invoice.reject",
      targetType: "owner_invoice",
      targetId: updated.id,
      before: { status: inv.status, version: inv.version },
      after: { status: updated.status, version: updated.version },
      reason: input.reason,
    });

    return updated;
  });
}

// ============================================================================
// void — admin cancels an invoice (dispute resolution, data correction, etc.)
// Only open / submitted / rejected invoices can be voided.
// Verified invoices cannot — the cash was already received and ledger settled.
// ============================================================================
export async function voidOwnerInvoice(
  admin: Profile,
  input: VoidOwnerInvoiceInput,
): Promise<OwnerInvoice> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(ownerInvoices)
      .where(eq(ownerInvoices.id, input.invoiceId))
      .limit(1);
    const inv = rows[0];
    if (!inv) throw new AdminError("invoice_not_found", "Invoice not found.");
    if (inv.version !== input.expectedVersion) {
      throw new AdminError(
        "version_conflict",
        "Invoice was changed in another tab. Reload to see the latest.",
      );
    }
    const VOIDABLE: ReadonlyArray<string> = ["open", "submitted", "rejected"];
    if (!VOIDABLE.includes(inv.status)) {
      throw new AdminError(
        "invalid_status_transition",
        `Cannot void an invoice in status "${inv.status}". Only open, submitted, or rejected invoices may be voided.`,
      );
    }

    const [updated] = await tx
      .update(ownerInvoices)
      .set({
        status: "void",
        rejectionReason: input.reason,
        verifiedAt: null,
        verifiedBy: null,
        version: inv.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ownerInvoices.id, inv.id),
          eq(ownerInvoices.version, inv.version),
        ),
      )
      .returning();
    if (!updated) {
      throw new AdminError(
        "version_conflict",
        "Invoice was changed in another tab. Reload to see the latest.",
      );
    }

    await recordAudit({
      actor: admin,
      action: "owner_invoice.void",
      targetType: "owner_invoice",
      targetId: updated.id,
      before: { status: inv.status, version: inv.version },
      after: { status: updated.status, version: updated.version },
      reason: input.reason,
    });

    return updated;
  });
}
