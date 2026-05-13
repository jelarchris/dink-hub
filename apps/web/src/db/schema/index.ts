import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  bookingStatusEnum,
  cancellationCategoryEnum,
  courtSurfaceEnum,
  genderEnum,
  ledgerAccountEnum,
  ledgerDirectionEnum,
  ownerInvoiceStatusEnum,
  paymentStatusEnum,
  payoutStatusEnum,
  userRoleEnum,
  venueStatusEnum,
} from "./enums";

/**
 * Drizzle TS schemas mirror 0001_init.sql for typesafe queries.
 * The SQL migration is the source of truth — schemas here are reflectors.
 *
 * Conventions:
 * - Money is `bigint` centavos in PHP. Use `formatPHP()` from @/lib/money for display.
 * - Timestamps are `timestamptz`. Always store UTC; format to Asia/Manila at UI boundary.
 * - `version` columns enable optimistic concurrency: UPDATE WHERE version = $expected.
 * - Soft delete via `deleted_at`. Never DELETE user-generated content.
 */

// ----------------------------------------------------------------------------
// profiles
// ----------------------------------------------------------------------------
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  phoneE164: text("phone_e164"),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").notNull().default("player"),
  city: text("city"),
  province: text("province"),
  ratingGlicko: numeric("rating_glicko", { precision: 6, scale: 2 }).default("1500.00"),
  ratingRd: numeric("rating_rd", { precision: 6, scale: 2 }).default("350.00"),
  gender: genderEnum("gender"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspensionReason: text("suspension_reason"),
  /** Per-owner notification preferences. Keys must match the DB check constraint. */
  notificationPrefs: jsonb("notification_prefs")
    .$type<{
      email_daily_digest: boolean;
      email_on_payment_submitted: boolean;
      email_on_booking_cancelled: boolean;
    }>()
    .notNull()
    .default({
      email_daily_digest: true,
      email_on_payment_submitted: true,
      email_on_booking_cancelled: true,
    }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ----------------------------------------------------------------------------
// venues
// ----------------------------------------------------------------------------
export const venues = pgTable("venues", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => profiles.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  province: text("province").notNull().default("Agusan del Sur"),
  postalCode: text("postal_code"),
  latitude: numeric("latitude", { precision: 9, scale: 6 }),
  longitude: numeric("longitude", { precision: 9, scale: 6 }),
  gcashAccountName: text("gcash_account_name"),
  gcashAccountNumber: text("gcash_account_number"),
  gcashQrImagePath: text("gcash_qr_image_path"),
  coverImageUrl: text("cover_image_url"),
  coverImagePath: text("cover_image_path"),
  status: venueStatusEnum("status").notNull().default("draft"),
  rejectionReason: text("rejection_reason"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ----------------------------------------------------------------------------
// courts
// ----------------------------------------------------------------------------
export const courts = pgTable("courts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  venueId: uuid("venue_id")
    .notNull()
    .references(() => venues.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  surface: courtSurfaceEnum("surface").notNull().default("hard"),
  isIndoor: boolean("is_indoor").notNull().default(false),
  hourlyRateCentavos: bigint("hourly_rate_centavos", { mode: "bigint" }).notNull(),
  imagePath: text("image_path"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ----------------------------------------------------------------------------
// system_fee_settings
// ----------------------------------------------------------------------------
export const systemFeeSettings = pgTable("system_fee_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  feeAmountCentavos: bigint("fee_amount_centavos", { mode: "bigint" }).notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => profiles.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------------------
// bookings
// ----------------------------------------------------------------------------
export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: uuid("player_id")
    .notNull()
    .references(() => profiles.id),
  venueId: uuid("venue_id")
    .notNull()
    .references(() => venues.id),
  courtId: uuid("court_id")
    .notNull()
    .references(() => courts.id),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  status: bookingStatusEnum("status").notNull().default("pending_payment"),
  courtFeeCentavos: bigint("court_fee_centavos", { mode: "bigint" }).notNull(),
  systemFeeCentavos: bigint("system_fee_centavos", { mode: "bigint" }).notNull(),
  // Generated column in SQL — read-only at the app layer.
  totalCentavos: bigint("total_centavos", { mode: "bigint" })
    .notNull()
    .generatedAlwaysAs(sql`court_fee_centavos + system_fee_centavos`),
  cancellableUntil: timestamp("cancellable_until", { withTimezone: true }).notNull(),
  paymentDueAt: timestamp("payment_due_at", { withTimezone: true }).notNull(),
  notes: text("notes"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // Cancellation metadata (Tier 4). DB CHECK enforces:
  //   status in (cancelled,no_show,refunded) ⇒ cancelled_at is not null.
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: uuid("cancelled_by").references(() => profiles.id),
  cancellationReason: text("cancellation_reason"),
  cancellationCategory: cancellationCategoryEnum("cancellation_category"),
  // Reschedule audit. originalStartAt/originalEndAt set only on FIRST reschedule
  // so the truly-original time survives multiple reschedules.
  originalStartAt: timestamp("original_start_at", { withTimezone: true }),
  originalEndAt: timestamp("original_end_at", { withTimezone: true }),
  rescheduledCount: integer("rescheduled_count").notNull().default(0),
  lastRescheduledAt: timestamp("last_rescheduled_at", { withTimezone: true }),
  lastRescheduledBy: uuid("last_rescheduled_by").references(() => profiles.id),
  // Set by the T-2h session-reminder cron after dispatching the email.
  // NULL = reminder not yet sent. Prevents duplicate sends on cron retries.
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
});

// ----------------------------------------------------------------------------
// slot_holds
// ----------------------------------------------------------------------------
export const slotHolds = pgTable("slot_holds", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: uuid("player_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  courtId: uuid("court_id")
    .notNull()
    .references(() => courts.id, { onDelete: "cascade" }),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------------------
// payments
// ----------------------------------------------------------------------------
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid("booking_id")
    .notNull()
    .unique()
    .references(() => bookings.id),
  receiptImagePath: text("receipt_image_path").notNull(),
  receiptHash: text("receipt_hash").notNull(),
  amountCentavos: bigint("amount_centavos", { mode: "bigint" }).notNull(),
  gcashReferenceNumber: text("gcash_reference_number"),
  status: paymentStatusEnum("status").notNull().default("submitted"),
  submittedBy: uuid("submitted_by")
    .notNull()
    .references(() => profiles.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedBy: uuid("verified_by").references(() => profiles.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  disputeReason: text("dispute_reason"),
  disputeOpenedAt: timestamp("dispute_opened_at", { withTimezone: true }),
  disputeOpenedBy: uuid("dispute_opened_by").references(() => profiles.id),
  disputeResolution: text("dispute_resolution"),
  disputeResolvedAt: timestamp("dispute_resolved_at", { withTimezone: true }),
  disputeResolvedBy: uuid("dispute_resolved_by").references(() => profiles.id),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------------------
// ledger_entries
// ----------------------------------------------------------------------------
export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid("booking_id").references(() => bookings.id),
  payoutId: uuid("payout_id"),
  ownerInvoiceId: uuid("owner_invoice_id"),
  account: ledgerAccountEnum("account").notNull(),
  direction: ledgerDirectionEnum("direction").notNull(),
  amountCentavos: bigint("amount_centavos", { mode: "bigint" }).notNull(),
  description: text("description").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------------------
// venue_payouts
// ----------------------------------------------------------------------------
export const venuePayouts = pgTable("venue_payouts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  venueId: uuid("venue_id")
    .notNull()
    .references(() => venues.id),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  grossCentavos: bigint("gross_centavos", { mode: "bigint" }).notNull(),
  feesCentavos: bigint("fees_centavos", { mode: "bigint" }).notNull(),
  netCentavos: bigint("net_centavos", { mode: "bigint" }).notNull(),
  carryoverCentavos: bigint("carryover_centavos", { mode: "bigint" }).notNull().default(0n),
  bookingCount: integer("booking_count").notNull(),
  status: payoutStatusEnum("status").notNull().default("pending"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paidReference: text("paid_reference"),
  notes: text("notes"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------------------
// admin_users
// ----------------------------------------------------------------------------
export const adminUsers = pgTable("admin_users", {
  userId: uuid("user_id").primaryKey(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  grantedBy: uuid("granted_by"),
});

// ----------------------------------------------------------------------------
// system_settings — single-row platform settings (promo + DinkHub GCash + base fee)
// ----------------------------------------------------------------------------
export const systemSettings = pgTable("system_settings", {
  id: boolean("id").primaryKey().default(true),
  promoActive: boolean("promo_active").notNull().default(true),
  promoHeadline: text("promo_headline").notNull(),
  promoDescription: text("promo_description").notNull(),
  promoUntilDate: date("promo_until_date"),
  promoShowOnHome: boolean("promo_show_on_home").notNull().default(true),
  promoShowOnBooking: boolean("promo_show_on_booking").notNull().default(true),
  baseBookingFeeCentavos: bigint("base_booking_fee_centavos", { mode: "bigint" })
    .notNull()
    .default(2000n),
  invoiceDueDays: integer("invoice_due_days").notNull().default(7),
  dinkhubGcashAccountName: text("dinkhub_gcash_account_name"),
  dinkhubGcashAccountNumber: text("dinkhub_gcash_account_number"),
  dinkhubGcashQrImagePath: text("dinkhub_gcash_qr_image_path"),
  updatedBy: uuid("updated_by").references(() => profiles.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// owner_invoices — weekly DinkHub booking-fee invoices billed to venue owners.
// ----------------------------------------------------------------------------
export const ownerInvoices = pgTable("owner_invoices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  bookingCount: integer("booking_count").notNull(),
  feesCentavos: bigint("fees_centavos", { mode: "bigint" }).notNull(),
  carryoverCentavos: bigint("carryover_centavos", { mode: "bigint" }).notNull().default(0n),
  totalCentavos: bigint("total_centavos", { mode: "bigint" })
    .notNull()
    .generatedAlwaysAs(sql`fees_centavos + carryover_centavos`),
  dueDate: date("due_date").notNull(),
  status: ownerInvoiceStatusEnum("status").notNull().default("open"),
  receiptImagePath: text("receipt_image_path"),
  receiptHash: text("receipt_hash"),
  gcashReferenceNumber: text("gcash_reference_number"),
  amountPaidCentavos: bigint("amount_paid_centavos", { mode: "bigint" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedBy: uuid("submitted_by").references(() => profiles.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: uuid("verified_by").references(() => profiles.id),
  rejectionReason: text("rejection_reason"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// audit_log — append-only record of every privileged admin mutation.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => profiles.id),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  reason: text("reason"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------------------
// court_closures — owner-scheduled blocks (maintenance, private events, etc.)
// ----------------------------------------------------------------------------
export const courtClosures = pgTable("court_closures", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  courtId: uuid("court_id")
    .notNull()
    .references(() => courts.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ----------------------------------------------------------------------------
// reviews — player reviews of venues, one per completed booking
// ----------------------------------------------------------------------------
export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid("booking_id")
    .notNull()
    .unique()
    .references(() => bookings.id, { onDelete: "restrict" }),
  playerId: uuid("player_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  venueId: uuid("venue_id")
    .notNull()
    .references(() => venues.id, { onDelete: "cascade" }),
  rating: smallint("rating").notNull(),
  body: text("body"),
  ownerReply: text("owner_reply"),
  ownerRepliedAt: timestamp("owner_replied_at", { withTimezone: true }),
  isHidden: boolean("is_hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------------------
// open_play_interest — homepage email capture for "Coming soon: Open Play"
// ----------------------------------------------------------------------------
export const openPlayInterest = pgTable("open_play_interest", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  market: text("market").notNull().default("agusan_del_sur"),
  source: text("source").notNull().default("home_teaser"),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------------------
// Inferred types — single source of truth for app code
// ----------------------------------------------------------------------------
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;
export type Court = typeof courts.$inferSelect;
export type NewCourt = typeof courts.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type SlotHold = typeof slotHolds.$inferSelect;
export type NewSlotHold = typeof slotHolds.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
export type VenuePayout = typeof venuePayouts.$inferSelect;
export type NewVenuePayout = typeof venuePayouts.$inferInsert;
export type SystemFeeSetting = typeof systemFeeSettings.$inferSelect;
export type NewSystemFeeSetting = typeof systemFeeSettings.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
export type SystemSettings = typeof systemSettings.$inferSelect;
export type NewSystemSettings = typeof systemSettings.$inferInsert;
export type OwnerInvoice = typeof ownerInvoices.$inferSelect;
export type NewOwnerInvoice = typeof ownerInvoices.$inferInsert;
export type CourtClosure = typeof courtClosures.$inferSelect;
export type NewCourtClosure = typeof courtClosures.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type OpenPlayInterest = typeof openPlayInterest.$inferSelect;
export type NewOpenPlayInterest = typeof openPlayInterest.$inferInsert;
