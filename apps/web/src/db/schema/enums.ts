import { pgEnum } from "drizzle-orm/pg-core";

/**
 * All Postgres enums used across schemas. Keep in one place to avoid duplicate
 * type creation across migrations.
 */

export const userRoleEnum = pgEnum("user_role", ["player", "venue_owner", "admin"]);

export const venueStatusEnum = pgEnum("venue_status", [
  "draft",
  "pending_review",
  "active",
  "suspended",
  "rejected",
]);

export const courtSurfaceEnum = pgEnum("court_surface", [
  "hard",
  "cushioned",
  "wood",
  "outdoor_sport",
  "other",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending_payment",
  "payment_submitted",
  "confirmed",
  "cancelled",
  "no_show",
  "expired",
  "refunded",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "submitted",
  "verified",
  "rejected",
  "disputed",
]);

export const ledgerAccountEnum = pgEnum("ledger_account", [
  "venue_payable",
  "platform_revenue",
  "platform_cash",
  "venue_refund",
  "fee_writeoff",
]);

export const ledgerDirectionEnum = pgEnum("ledger_direction", ["debit", "credit"]);

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "processing",
  "paid",
  "failed",
  "on_hold",
]);

export const cancellationCategoryEnum = pgEnum("cancellation_category", [
  "weather",
  "court_unavailable",
  "venue_closure",
  "player_request",
  "admin_action",
  "other",
]);

export const ownerInvoiceStatusEnum = pgEnum("owner_invoice_status", [
  "open",
  "submitted",
  "verified",
  "rejected",
  "void",
]);
