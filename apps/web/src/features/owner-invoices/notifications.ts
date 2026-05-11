import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ownerInvoices, profiles, venues } from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import {
  ownerInvoiceIssuedEmail,
  ownerInvoiceRejectedEmail,
  ownerInvoiceVerifiedEmail,
} from "@/lib/email/templates";
import { captureException } from "@/lib/observability";

/**
 * Owner-invoice notifications. Side-effect only — never throws to caller.
 *
 * Loads the joined context in a single query, dispatches the email, and
 * captures any error to Sentry. The admin action result is unaffected by
 * email failures.
 */

interface InvoiceJoin {
  invoiceId: string;
  venueName: string;
  periodStart: Date;
  periodEnd: Date;
  totalCentavos: bigint;
  ownerEmail: string;
  ownerDisplayName: string;
}

async function loadInvoiceJoin(invoiceId: string): Promise<InvoiceJoin | null> {
  const rows = await db
    .select({
      invoiceId: ownerInvoices.id,
      venueName: venues.name,
      periodStart: ownerInvoices.periodStart,
      periodEnd: ownerInvoices.periodEnd,
      totalCentavos: ownerInvoices.totalCentavos,
      ownerEmail: profiles.email,
      ownerDisplayName: profiles.displayName,
    })
    .from(ownerInvoices)
    .innerJoin(venues, eq(venues.id, ownerInvoices.venueId))
    .innerJoin(profiles, eq(profiles.id, venues.ownerId))
    .where(eq(ownerInvoices.id, invoiceId))
    .limit(1);
  return rows[0] ?? null;
}

export async function notifyOwnerInvoiceVerified(invoiceId: string): Promise<void> {
  try {
    const ctx = await loadInvoiceJoin(invoiceId);
    if (!ctx) return;
    const tpl = ownerInvoiceVerifiedEmail({
      invoiceId: ctx.invoiceId,
      venueName: ctx.venueName,
      periodStart: ctx.periodStart,
      periodEnd: ctx.periodEnd,
      totalCentavos: ctx.totalCentavos,
      ownerDisplayName: ctx.ownerDisplayName,
    });
    await sendEmail({ to: ctx.ownerEmail, ...tpl, tag: "owner_invoice_verified" });
  } catch (err) {
    captureException(err, { scope: "notify.owner_invoice_verified", extra: { invoiceId } });
  }
}

export async function notifyOwnerInvoiceRejected(
  invoiceId: string,
  reason: string,
): Promise<void> {
  try {
    const ctx = await loadInvoiceJoin(invoiceId);
    if (!ctx) return;
    const tpl = ownerInvoiceRejectedEmail({
      invoiceId: ctx.invoiceId,
      venueName: ctx.venueName,
      periodStart: ctx.periodStart,
      periodEnd: ctx.periodEnd,
      totalCentavos: ctx.totalCentavos,
      ownerDisplayName: ctx.ownerDisplayName,
      reason,
    });
    await sendEmail({ to: ctx.ownerEmail, ...tpl, tag: "owner_invoice_rejected" });
  } catch (err) {
    captureException(err, { scope: "notify.owner_invoice_rejected", extra: { invoiceId } });
  }
}

export async function notifyOwnerInvoiceIssued(invoiceId: string): Promise<void> {
  try {
    const ctx = await loadInvoiceJoin(invoiceId);
    if (!ctx) return;
    const tpl = ownerInvoiceIssuedEmail({
      invoiceId: ctx.invoiceId,
      venueName: ctx.venueName,
      periodStart: ctx.periodStart,
      periodEnd: ctx.periodEnd,
      totalCentavos: ctx.totalCentavos,
      ownerDisplayName: ctx.ownerDisplayName,
    });
    await sendEmail({ to: ctx.ownerEmail, ...tpl, tag: "owner_invoice_issued" });
  } catch (err) {
    captureException(err, { scope: "notify.owner_invoice_issued", extra: { invoiceId } });
  }
}
