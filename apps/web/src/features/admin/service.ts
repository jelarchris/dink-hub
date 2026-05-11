import "server-only";
import { and, asc, count, desc, eq, gte, ilike, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditLog,
  bookings,
  courts,
  ownerInvoices,
  payments,
  profiles,
  systemFeeSettings,
  venues,
  type AuditLogEntry,
  type Booking,
  type Profile,
  type SystemFeeSetting,
  type Venue,
} from "@/db/schema";
import { recordAudit } from "./audit";
import { AdminError } from "./errors";
import {
  PAGE_SIZE,
  phpStringToCentavos,
  type AuditListFilter,
  type BookingListFilter,
  type ForceCancelBookingInput,
  type SetUserSuspensionInput,
  type UpdateSystemFeeInput,
  type UpdateUserRoleInput,
  type UserListFilter,
  type VenueListFilter,
  type VenueReviewInput,
} from "./schema";

// ============================================================================
// guards
// ============================================================================

export async function requireAdmin(): Promise<Profile> {
  const { getSessionUser } = await import("@/server/session");
  const profile = await getSessionUser();
  if (!profile) throw new AdminError("unauthenticated", "You must be signed in.");
  if (profile.role !== "admin") {
    throw new AdminError("not_admin", "Admin access required.");
  }
  if (profile.suspendedAt) {
    throw new AdminError("not_admin", "Your admin account is suspended.");
  }
  return profile;
}

// ============================================================================
// dashboard
// ============================================================================

export interface AdminDashboardStats {
  pendingVenues: number;
  activeVenues: number;
  totalUsers: number;
  bookingsLast7Days: number;
  grossLast7DaysCentavos: bigint;
  feeAccruedLast7DaysCentavos: bigint;
  pendingPaymentBookings: number;
  recentPendingVenues: ReadonlyArray<{ venue: Venue; ownerEmail: string }>;
  /** Sum of total_centavos for all verified invoices in the current calendar month (Manila). */
  invoicesCollectedThisMonthCentavos: bigint;
  /** Number of invoices currently awaiting admin review (status = submitted). */
  pendingInvoices: number;
}

export async function getDashboardStats(): Promise<AdminDashboardStats> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Manila month boundary: UTC+8, no DST.
  const nowManila = new Date(Date.now() + 8 * 3_600_000);
  const monthStartManila = new Date(
    Date.UTC(nowManila.getUTCFullYear(), nowManila.getUTCMonth(), 1) - 8 * 3_600_000,
  );

  const [
    [pendingV],
    [activeV],
    [totalU],
    [bookings7d],
    [pendingPay],
    pendingList,
    [invoiceMonth],
    [pendingInv],
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(venues)
      .where(and(eq(venues.status, "pending_review"), isNull(venues.deletedAt))),
    db
      .select({ n: count() })
      .from(venues)
      .where(and(eq(venues.status, "active"), isNull(venues.deletedAt))),
    db.select({ n: count() }).from(profiles).where(isNull(profiles.deletedAt)),
    db
      .select({
        n: count(),
        gross: sql<string>`coalesce(sum(${bookings.courtFeeCentavos}), 0)`.mapWith(String),
        fee: sql<string>`coalesce(sum(${bookings.systemFeeCentavos}), 0)`.mapWith(String),
      })
      .from(bookings)
      .where(and(gte(bookings.createdAt, since), eq(bookings.status, "confirmed"))),
    db
      .select({ n: count() })
      .from(bookings)
      .where(eq(bookings.status, "pending_payment")),
    db
      .select({ venue: venues, ownerEmail: profiles.email })
      .from(venues)
      .innerJoin(profiles, eq(profiles.id, venues.ownerId))
      .where(and(eq(venues.status, "pending_review"), isNull(venues.deletedAt)))
      .orderBy(asc(venues.createdAt))
      .limit(5),
    db
      .select({
        total: sql<string>`coalesce(sum(${ownerInvoices.totalCentavos}), 0)`.mapWith(String),
      })
      .from(ownerInvoices)
      .where(
        and(
          eq(ownerInvoices.status, "verified"),
          gte(ownerInvoices.verifiedAt, monthStartManila),
        ),
      ),
    db
      .select({ n: count() })
      .from(ownerInvoices)
      .where(eq(ownerInvoices.status, "submitted")),
  ]);

  return {
    pendingVenues: pendingV?.n ?? 0,
    activeVenues: activeV?.n ?? 0,
    totalUsers: totalU?.n ?? 0,
    bookingsLast7Days: bookings7d?.n ?? 0,
    grossLast7DaysCentavos: BigInt(bookings7d?.gross ?? "0"),
    feeAccruedLast7DaysCentavos: BigInt(bookings7d?.fee ?? "0"),
    pendingPaymentBookings: pendingPay?.n ?? 0,
    recentPendingVenues: pendingList,
    invoicesCollectedThisMonthCentavos: BigInt(invoiceMonth?.total ?? "0"),
    pendingInvoices: pendingInv?.n ?? 0,
  };
}

// ============================================================================
// venues
// ============================================================================

export interface AdminVenueRow {
  venue: Venue;
  ownerEmail: string;
  ownerName: string;
  courtCount: number;
}

export interface PagedResult<T> {
  rows: ReadonlyArray<T>;
  total: number;
  page: number;
  pageSize: number;
}

export async function listVenues(filter: VenueListFilter): Promise<PagedResult<AdminVenueRow>> {
  const wheres = [isNull(venues.deletedAt)];
  if (filter.status !== "all") wheres.push(eq(venues.status, filter.status));
  if (filter.q) {
    wheres.push(
      or(ilike(venues.name, `%${filter.q}%`), ilike(venues.city, `%${filter.q}%`))!,
    );
  }
  const where = and(...wheres);

  const [rows, [c]] = await Promise.all([
    db
      .select({
        venue: venues,
        ownerEmail: profiles.email,
        ownerName: profiles.displayName,
        courtCount:
          sql<number>`(select count(*)::int from ${courts} where ${courts.venueId} = ${venues.id} and ${courts.deletedAt} is null)`,
      })
      .from(venues)
      .innerJoin(profiles, eq(profiles.id, venues.ownerId))
      .where(where)
      .orderBy(desc(venues.createdAt))
      .limit(PAGE_SIZE)
      .offset((filter.page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(venues).where(where),
  ]);

  return { rows, total: c?.n ?? 0, page: filter.page, pageSize: PAGE_SIZE };
}

export async function getVenueDetail(venueId: string): Promise<{
  venue: Venue;
  owner: Profile;
  courtCount: number;
  bookingCount: number;
}> {
  const rows = await db
    .select({ venue: venues, owner: profiles })
    .from(venues)
    .innerJoin(profiles, eq(profiles.id, venues.ownerId))
    .where(eq(venues.id, venueId))
    .limit(1);
  const r = rows[0];
  if (!r) throw new AdminError("venue_not_found", "Venue not found.");

  const [[c1], [c2]] = await Promise.all([
    db
      .select({ n: count() })
      .from(courts)
      .where(and(eq(courts.venueId, venueId), isNull(courts.deletedAt))),
    db.select({ n: count() }).from(bookings).where(eq(bookings.venueId, venueId)),
  ]);

  return {
    venue: r.venue,
    owner: r.owner,
    courtCount: c1?.n ?? 0,
    bookingCount: c2?.n ?? 0,
  };
}

const ALLOWED_VENUE_TRANSITIONS: Record<
  Exclude<Venue["status"], never>,
  ReadonlyArray<{ action: string; next: Venue["status"] }>
> = {
  draft: [],
  pending_review: [
    { action: "approve", next: "active" },
    { action: "reject", next: "rejected" },
  ],
  active: [{ action: "suspend", next: "suspended" }],
  suspended: [{ action: "reinstate", next: "active" }],
  rejected: [],
};

export async function reviewVenue(
  admin: Profile,
  input: VenueReviewInput,
): Promise<Venue> {
  const existing = await db
    .select()
    .from(venues)
    .where(eq(venues.id, input.venueId))
    .limit(1);
  const v = existing[0];
  if (!v) throw new AdminError("venue_not_found", "Venue not found.");
  if (v.version !== input.expectedVersion) {
    throw new AdminError(
      "version_conflict",
      "This venue was changed in another tab. Reload to see the latest.",
    );
  }

  const allowed = ALLOWED_VENUE_TRANSITIONS[v.status];
  const transition = allowed.find((t) => t.action === input.action);
  if (!transition) {
    throw new AdminError(
      "invalid_status_transition",
      `Cannot ${input.action} a venue with status "${v.status}".`,
    );
  }

  if (input.action === "reject" && (!input.reason || input.reason.length < 3)) {
    throw new AdminError("validation", "A reason is required when rejecting.");
  }

  const [updated] = await db
    .update(venues)
    .set({
      status: transition.next,
      rejectionReason: input.action === "reject" ? input.reason : v.rejectionReason,
      updatedAt: new Date(),
    })
    .where(and(eq(venues.id, v.id), eq(venues.version, input.expectedVersion)))
    .returning();
  if (!updated) {
    throw new AdminError(
      "version_conflict",
      "This venue was changed in another tab. Reload to see the latest.",
    );
  }

  await recordAudit({
    actor: admin,
    action: `venue.${input.action}`,
    targetType: "venue",
    targetId: v.id,
    before: { status: v.status, rejection_reason: v.rejectionReason },
    after: { status: updated.status, rejection_reason: updated.rejectionReason },
    reason: input.reason,
  });

  return updated;
}

// ============================================================================
// users
// ============================================================================

export interface AdminUserRow {
  profile: Profile;
  venueCount: number;
  bookingCount: number;
}

export async function listUsers(filter: UserListFilter): Promise<PagedResult<AdminUserRow>> {
  const wheres = [isNull(profiles.deletedAt)];
  if (filter.role !== "all") wheres.push(eq(profiles.role, filter.role));
  if (filter.status === "suspended") wheres.push(sql`${profiles.suspendedAt} is not null`);
  if (filter.status === "active") wheres.push(isNull(profiles.suspendedAt));
  if (filter.q) {
    wheres.push(
      or(ilike(profiles.email, `%${filter.q}%`), ilike(profiles.displayName, `%${filter.q}%`))!,
    );
  }
  const where = and(...wheres);

  const [rows, [c]] = await Promise.all([
    db
      .select({
        profile: profiles,
        venueCount:
          sql<number>`(select count(*)::int from ${venues} where ${venues.ownerId} = ${profiles.id} and ${venues.deletedAt} is null)`,
        bookingCount:
          sql<number>`(select count(*)::int from ${bookings} where ${bookings.playerId} = ${profiles.id})`,
      })
      .from(profiles)
      .where(where)
      .orderBy(desc(profiles.createdAt))
      .limit(PAGE_SIZE)
      .offset((filter.page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(profiles).where(where),
  ]);

  return { rows, total: c?.n ?? 0, page: filter.page, pageSize: PAGE_SIZE };
}

export async function getUserDetail(userId: string): Promise<{
  profile: Profile;
  venueCount: number;
  bookingCount: number;
  recentBookings: Booking[];
}> {
  const rows = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  const profile = rows[0];
  if (!profile) throw new AdminError("user_not_found", "User not found.");

  const [[c1], [c2], recent] = await Promise.all([
    db
      .select({ n: count() })
      .from(venues)
      .where(and(eq(venues.ownerId, userId), isNull(venues.deletedAt))),
    db.select({ n: count() }).from(bookings).where(eq(bookings.playerId, userId)),
    db
      .select()
      .from(bookings)
      .where(eq(bookings.playerId, userId))
      .orderBy(desc(bookings.createdAt))
      .limit(10),
  ]);

  return {
    profile,
    venueCount: c1?.n ?? 0,
    bookingCount: c2?.n ?? 0,
    recentBookings: recent,
  };
}

export async function updateUserRole(
  admin: Profile,
  input: UpdateUserRoleInput,
): Promise<Profile> {
  if (input.userId === admin.id) {
    throw new AdminError(
      "cannot_self_modify",
      "You cannot change your own role. Ask another admin.",
    );
  }
  const rows = await db.select().from(profiles).where(eq(profiles.id, input.userId)).limit(1);
  const target = rows[0];
  if (!target) throw new AdminError("user_not_found", "User not found.");

  if (target.role === input.role) return target;

  const [updated] = await db
    .update(profiles)
    .set({ role: input.role, updatedAt: new Date() })
    .where(eq(profiles.id, target.id))
    .returning();
  if (!updated) throw new AdminError("unknown", "Failed to update user.");

  await recordAudit({
    actor: admin,
    action: "user.role.change",
    targetType: "user",
    targetId: target.id,
    before: { role: target.role },
    after: { role: updated.role },
    reason: input.reason,
  });

  return updated;
}

export async function setUserSuspension(
  admin: Profile,
  input: SetUserSuspensionInput,
): Promise<Profile> {
  if (input.userId === admin.id) {
    throw new AdminError(
      "cannot_self_modify",
      "You cannot suspend your own account.",
    );
  }
  const rows = await db.select().from(profiles).where(eq(profiles.id, input.userId)).limit(1);
  const target = rows[0];
  if (!target) throw new AdminError("user_not_found", "User not found.");

  if (input.action === "suspend" && (!input.reason || input.reason.length < 3)) {
    throw new AdminError("validation", "A reason is required when suspending.");
  }

  const nextSuspendedAt = input.action === "suspend" ? new Date() : null;
  const nextReason = input.action === "suspend" ? input.reason : null;

  const [updated] = await db
    .update(profiles)
    .set({
      suspendedAt: nextSuspendedAt,
      suspensionReason: nextReason,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, target.id))
    .returning();
  if (!updated) throw new AdminError("unknown", "Failed to update user.");

  await recordAudit({
    actor: admin,
    action: `user.${input.action}`,
    targetType: "user",
    targetId: target.id,
    before: {
      suspended_at: target.suspendedAt,
      suspension_reason: target.suspensionReason,
    },
    after: {
      suspended_at: updated.suspendedAt,
      suspension_reason: updated.suspensionReason,
    },
    reason: input.reason,
  });

  return updated;
}

// ============================================================================
// system fee
// ============================================================================

export async function getCurrentSystemFee(): Promise<SystemFeeSetting | null> {
  const rows = await db
    .select()
    .from(systemFeeSettings)
    .where(lte(systemFeeSettings.effectiveFrom, sql`now()`))
    .orderBy(desc(systemFeeSettings.effectiveFrom))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSystemFeeHistory(): Promise<
  ReadonlyArray<{ setting: SystemFeeSetting; updatedByEmail: string | null }>
> {
  return db
    .select({
      setting: systemFeeSettings,
      updatedByEmail: profiles.email,
    })
    .from(systemFeeSettings)
    .leftJoin(profiles, eq(profiles.id, systemFeeSettings.updatedBy))
    .orderBy(desc(systemFeeSettings.effectiveFrom))
    .limit(50);
}

export async function updateSystemFee(
  admin: Profile,
  input: UpdateSystemFeeInput,
): Promise<SystemFeeSetting> {
  const newCentavos = phpStringToCentavos(input.feePhp);
  const current = await getCurrentSystemFee();

  if (current && current.feeAmountCentavos === newCentavos) {
    throw new AdminError("fee_unchanged", "The fee is already set to that amount.");
  }

  const [created] = await db
    .insert(systemFeeSettings)
    .values({
      feeAmountCentavos: newCentavos,
      updatedBy: admin.id,
      notes: input.notes,
    })
    .returning();
  if (!created) throw new AdminError("unknown", "Failed to update fee.");

  await recordAudit({
    actor: admin,
    action: "system_fee.update",
    targetType: "system_fee",
    targetId: created.id,
    before: current
      ? { fee_amount_centavos: current.feeAmountCentavos.toString() }
      : null,
    after: { fee_amount_centavos: created.feeAmountCentavos.toString() },
    reason: input.notes,
  });

  return created;
}

// ============================================================================
// bookings
// ============================================================================

export interface AdminBookingRow {
  booking: Booking;
  playerEmail: string;
  playerName: string;
  venueName: string;
  courtName: string;
}

export async function listBookings(
  filter: BookingListFilter,
): Promise<PagedResult<AdminBookingRow>> {
  const wheres = [];
  if (filter.status !== "all") wheres.push(eq(bookings.status, filter.status));
  if (filter.venueId) wheres.push(eq(bookings.venueId, filter.venueId));
  if (filter.q) {
    wheres.push(
      or(
        ilike(profiles.email, `%${filter.q}%`),
        ilike(profiles.displayName, `%${filter.q}%`),
        ilike(venues.name, `%${filter.q}%`),
      )!,
    );
  }
  const where = wheres.length > 0 ? and(...wheres) : undefined;

  const baseQuery = db
    .select({
      booking: bookings,
      playerEmail: profiles.email,
      playerName: profiles.displayName,
      venueName: venues.name,
      courtName: courts.name,
    })
    .from(bookings)
    .innerJoin(profiles, eq(profiles.id, bookings.playerId))
    .innerJoin(venues, eq(venues.id, bookings.venueId))
    .innerJoin(courts, eq(courts.id, bookings.courtId));

  const countQuery = db
    .select({ n: count() })
    .from(bookings)
    .innerJoin(profiles, eq(profiles.id, bookings.playerId))
    .innerJoin(venues, eq(venues.id, bookings.venueId))
    .innerJoin(courts, eq(courts.id, bookings.courtId));

  const [rows, [c]] = await Promise.all([
    (where ? baseQuery.where(where) : baseQuery)
      .orderBy(desc(bookings.createdAt))
      .limit(PAGE_SIZE)
      .offset((filter.page - 1) * PAGE_SIZE),
    where ? countQuery.where(where) : countQuery,
  ]);

  return { rows, total: c?.n ?? 0, page: filter.page, pageSize: PAGE_SIZE };
}

export async function getBookingDetail(bookingId: string): Promise<{
  booking: Booking;
  player: Profile;
  venueName: string;
  courtName: string;
  payment: Awaited<ReturnType<typeof loadPaymentForBooking>>;
}> {
  const rows = await db
    .select({
      booking: bookings,
      player: profiles,
      venueName: venues.name,
      courtName: courts.name,
    })
    .from(bookings)
    .innerJoin(profiles, eq(profiles.id, bookings.playerId))
    .innerJoin(venues, eq(venues.id, bookings.venueId))
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  const r = rows[0];
  if (!r) throw new AdminError("venue_not_found", "Booking not found.");
  const payment = await loadPaymentForBooking(bookingId);
  return { ...r, payment };
}

async function loadPaymentForBooking(bookingId: string) {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.bookingId, bookingId))
    .limit(1);
  return rows[0] ?? null;
}

export async function forceCancelBooking(
  admin: Profile,
  input: ForceCancelBookingInput,
): Promise<Booking> {
  const rows = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  const b = rows[0];
  if (!b) throw new AdminError("venue_not_found", "Booking not found.");
  if (b.version !== input.expectedVersion) {
    throw new AdminError(
      "version_conflict",
      "This booking was changed in another tab. Reload to see the latest.",
    );
  }
  if (b.status === "cancelled" || b.status === "expired" || b.status === "refunded") {
    throw new AdminError(
      "invalid_status_transition",
      `Cannot force-cancel a booking in status "${b.status}".`,
    );
  }

  const [updated] = await db
    .update(bookings)
    .set({
      status: "cancelled",
      notes: b.notes
        ? `${b.notes}\n\n[Admin force-cancel] ${input.reason}`
        : `[Admin force-cancel] ${input.reason}`,
      cancelledAt: new Date(),
      cancelledBy: admin.id,
      cancellationReason: input.reason,
      cancellationCategory: "admin_action",
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, b.id), eq(bookings.version, input.expectedVersion)))
    .returning();
  if (!updated) {
    throw new AdminError(
      "version_conflict",
      "This booking was changed in another tab. Reload to see the latest.",
    );
  }

  await recordAudit({
    actor: admin,
    action: "booking.force_cancel",
    targetType: "booking",
    targetId: b.id,
    before: { status: b.status },
    after: { status: updated.status },
    reason: input.reason,
  });

  return updated;
}

// ============================================================================
// audit log viewer
// ============================================================================

export async function listAuditLog(
  filter: AuditListFilter,
): Promise<PagedResult<AuditLogEntry>> {
  const wheres = [];
  if (filter.action) wheres.push(eq(auditLog.action, filter.action));
  if (filter.actorId) wheres.push(eq(auditLog.actorId, filter.actorId));
  if (filter.targetType) wheres.push(eq(auditLog.targetType, filter.targetType));
  const where = wheres.length > 0 ? and(...wheres) : undefined;

  const base = db.select().from(auditLog);
  const countBase = db.select({ n: count() }).from(auditLog);

  const [rows, [c]] = await Promise.all([
    (where ? base.where(where) : base)
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((filter.page - 1) * PAGE_SIZE),
    where ? countBase.where(where) : countBase,
  ]);

  return { rows, total: c?.n ?? 0, page: filter.page, pageSize: PAGE_SIZE };
}

// Suppress unused-imports lint for symbols held for future use.
export const _unused = { gte, ne };
