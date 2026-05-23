import "server-only";
import { and, count, desc, eq, gt, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { haversineKm } from "@/lib/distance";
import {
  bookings,
  courtClosures,
  courts,
  ledgerEntries,
  openPlaySessionCourts,
  openPlaySessions,
  openPlaySignupPayments,
  openPlaySignups,
  profiles,
  venues,
  type Booking,
  type Court,
  type NewBooking,
  type NewLedgerEntry,
  type NewOpenPlaySession,
  type NewOpenPlaySignup,
  type NewOpenPlaySignupPayment,
  type OpenPlaySession,
  type OpenPlaySignup,
  type OpenPlaySignupPayment,
  type Venue,
} from "@/db/schema";

/**
 * Repository layer for the open-play feature. Pure data access — NO business
 * logic, NO authorization. Connection pool bypasses RLS; auth happens in the
 * service layer. Optional `exec` parameter lets callers compose inside a tx.
 */

/**
 * SQL fragment that identifies signups currently occupying a slot.
 *
 * A signup occupies a slot when it is NOT cancelled / expired AND, if it is
 * still `pending_payment`, its 15-min payment window has not yet lapsed.
 * Filtering on `payment_due_at` here means the displayed `activeSignupCount`
 * is always correct, even if the every-minute cron hasn't run yet to flip the
 * row to `expired` in the DB. Defence in depth alongside `expirePendingSignups`.
 */
const activeSignupWhere = sql`${openPlaySignups.status} not in ('cancelled', 'expired') and not (${openPlaySignups.status} = 'pending_payment' and ${openPlaySignups.paymentDueAt} <= now())`;

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// ----------------------------------------------------------------------------
// Court / venue
// ----------------------------------------------------------------------------

export async function findCourtById(
  courtId: string,
  exec: Executor = db,
): Promise<{ court: Court; venue: Venue } | null> {
  const rows = await exec
    .select({ court: courts, venue: venues })
    .from(courts)
    .innerJoin(venues, eq(venues.id, courts.venueId))
    .where(eq(courts.id, courtId))
    .limit(1);
  return rows[0] ?? null;
}

export async function hasActiveClosureInRange(
  args: { courtId: string; startAt: Date; endAt: Date },
  exec: Executor = db,
): Promise<boolean> {
  const rows = await exec
    .select({ id: courtClosures.id })
    .from(courtClosures)
    .where(
      and(
        eq(courtClosures.courtId, args.courtId),
        isNull(courtClosures.deletedAt),
        lt(courtClosures.startAt, args.endAt),
        gt(courtClosures.endAt, args.startAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ----------------------------------------------------------------------------
// Sessions
// ----------------------------------------------------------------------------

export async function insertSession(
  values: NewOpenPlaySession,
  exec: Executor = db,
): Promise<OpenPlaySession> {
  const rows = await exec.insert(openPlaySessions).values(values).returning();
  const inserted = rows[0];
  if (!inserted) throw new Error("insertSession: no row returned");
  return inserted;
}

export async function findSessionById(
  sessionId: string,
  exec: Executor = db,
): Promise<OpenPlaySession | null> {
  const rows = await exec
    .select()
    .from(openPlaySessions)
    .where(eq(openPlaySessions.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findSessionWithVenue(
  sessionId: string,
  exec: Executor = db,
): Promise<{
  session: OpenPlaySession;
  venue: Venue;
  court: Court;
} | null> {
  const rows = await exec
    .select({ session: openPlaySessions, venue: venues, court: courts })
    .from(openPlaySessions)
    .innerJoin(venues, eq(venues.id, openPlaySessions.venueId))
    .innerJoin(courts, eq(courts.id, openPlaySessions.courtId))
    .where(eq(openPlaySessions.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Optimistic update: only succeeds when `version` matches `expectedVersion`.
 */
export async function updateSession(
  sessionId: string,
  expectedVersion: number,
  patch: Partial<
    Pick<
      OpenPlaySession,
      | "title"
      | "description"
      | "skillLevel"
      | "capacity"
      | "pricePerPlayerCentavos"
      | "systemFeePerPlayerCentavos"
      | "status"
      | "shadowBookingId"
      | "publishedAt"
      | "cancelledAt"
      | "cancelledBy"
      | "cancellationReason"
      | "deletedAt"
    >
  >,
  exec: Executor = db,
): Promise<OpenPlaySession | null> {
  const rows = await exec
    .update(openPlaySessions)
    .set(patch)
    .where(
      and(
        eq(openPlaySessions.id, sessionId),
        eq(openPlaySessions.version, expectedVersion),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export interface SessionListItem {
  session: OpenPlaySession;
  venue: Pick<Venue, "id" | "name" | "slug" | "city" | "province" | "coverImageUrl">;
  /** Primary court (mirror of session.court_id) — kept for back-compat. */
  court: Pick<Court, "id" | "name">;
  /** All courts the session occupies. Always includes the primary court. */
  courts: Array<Pick<Court, "id" | "name">>;
  activeSignupCount: number;
  /** Kilometres from the requested origin (when `near` is supplied). */
  distanceKm: number | null;
}

// ----------------------------------------------------------------------------
// Multi-court join helpers (open_play_session_courts)
// ----------------------------------------------------------------------------

/**
 * Insert one join row per court. Used both at create-time (shadow null) and
 * is idempotent — duplicate keys are no-ops.
 */
export async function insertSessionCourts(
  sessionId: string,
  courtIds: readonly string[],
  exec: Executor = db,
): Promise<void> {
  if (courtIds.length === 0) return;
  await exec
    .insert(openPlaySessionCourts)
    .values(courtIds.map((courtId) => ({ sessionId, courtId })))
    .onConflictDoNothing();
}

/** Return join rows (including per-court shadow_booking_id) for one session. */
export async function listSessionCourtRows(
  sessionId: string,
  exec: Executor = db,
): Promise<Array<{ courtId: string; shadowBookingId: string | null }>> {
  return exec
    .select({
      courtId: openPlaySessionCourts.courtId,
      shadowBookingId: openPlaySessionCourts.shadowBookingId,
    })
    .from(openPlaySessionCourts)
    .where(eq(openPlaySessionCourts.sessionId, sessionId));
}

/** Set the shadow booking id on one (session, court) pair. */
export async function setSessionCourtShadow(
  sessionId: string,
  courtId: string,
  shadowBookingId: string | null,
  exec: Executor = db,
): Promise<void> {
  await exec
    .update(openPlaySessionCourts)
    .set({ shadowBookingId })
    .where(
      and(
        eq(openPlaySessionCourts.sessionId, sessionId),
        eq(openPlaySessionCourts.courtId, courtId),
      ),
    );
}

/**
 * Bulk-fetch the courts attached to every session id, grouped into a Map.
 * Used by list endpoints to attach `courts: []` without N+1 queries.
 */
export async function listCourtsForSessions(
  sessionIds: readonly string[],
  exec: Executor = db,
): Promise<Map<string, Array<Pick<Court, "id" | "name">>>> {
  const map = new Map<string, Array<Pick<Court, "id" | "name">>>();
  if (sessionIds.length === 0) return map;
  const rows = await exec
    .select({
      sessionId: openPlaySessionCourts.sessionId,
      courtId: courts.id,
      courtName: courts.name,
    })
    .from(openPlaySessionCourts)
    .innerJoin(courts, eq(courts.id, openPlaySessionCourts.courtId))
    .where(inArray(openPlaySessionCourts.sessionId, [...sessionIds]))
    .orderBy(courts.name);
  for (const r of rows) {
    const arr = map.get(r.sessionId) ?? [];
    arr.push({ id: r.courtId, name: r.courtName });
    map.set(r.sessionId, arr);
  }
  return map;
}

/**
 * For the booking flow: return every published-session court that overlaps the
 * given time window, joined to its parent session metadata. One row per
 * (session, court). Used to render OPEN PLAY tiles in the slot picker.
 */
export interface OpenPlayForCourtsRow {
  sessionId: string;
  courtId: string;
  startAt: Date;
  endAt: Date;
  title: string;
  capacity: number;
  pricePerPlayerCentavos: bigint;
  activeSignupCount: number;
}

export async function listOpenPlayForCourts(
  args: { courtIds: readonly string[]; fromAt: Date; toAt: Date },
  exec: Executor = db,
): Promise<OpenPlayForCourtsRow[]> {
  if (args.courtIds.length === 0) return [];
  const rows = await exec
    .select({
      sessionId: openPlaySessions.id,
      courtId: openPlaySessionCourts.courtId,
      startAt: openPlaySessions.startAt,
      endAt: openPlaySessions.endAt,
      title: openPlaySessions.title,
      capacity: openPlaySessions.capacity,
      pricePerPlayerCentavos: openPlaySessions.pricePerPlayerCentavos,
    })
    .from(openPlaySessions)
    .innerJoin(
      openPlaySessionCourts,
      eq(openPlaySessionCourts.sessionId, openPlaySessions.id),
    )
    .where(
      and(
        inArray(openPlaySessionCourts.courtId, [...args.courtIds]),
        eq(openPlaySessions.status, "published"),
        isNull(openPlaySessions.deletedAt),
        lt(openPlaySessions.startAt, args.toAt),
        gt(openPlaySessions.endAt, args.fromAt),
      ),
    );

  if (rows.length === 0) return [];

  const sessionIds = Array.from(new Set(rows.map((r) => r.sessionId)));
  const counts = await exec
    .select({ sessionId: openPlaySignups.sessionId, c: count() })
    .from(openPlaySignups)
    .where(
      and(
        inArray(openPlaySignups.sessionId, sessionIds),
        activeSignupWhere,
      ),
    )
    .groupBy(openPlaySignups.sessionId);
  const countMap = new Map(counts.map((c) => [c.sessionId, Number(c.c)]));

  return rows.map((r) => ({
    ...r,
    activeSignupCount: countMap.get(r.sessionId) ?? 0,
  }));
}

/**
 * Public list — upcoming PUBLISHED sessions, ordered by start time.
 * When `near` is supplied, results are re-sorted by ascending distance from
 * that origin (sessions with no venue coords sink to the bottom).
 */
export async function listPublishedSessions(
  args: { fromAt?: Date; limit?: number; near?: { lat: number; lng: number } } = {},
  exec: Executor = db,
): Promise<SessionListItem[]> {
  const from = args.fromAt ?? new Date();
  const limit = Math.min(args.limit ?? 50, 100);
  // Distance sort happens in JS; widen the DB fetch so the top-N stays stable.
  const dbLimit = args.near ? Math.min(Math.max(limit, 100), 200) : limit;

  const rows = await exec
    .select({
      session: openPlaySessions,
      venue: {
        id: venues.id,
        name: venues.name,
        slug: venues.slug,
        city: venues.city,
        province: venues.province,
        coverImageUrl: venues.coverImageUrl,
        latitude: venues.latitude,
        longitude: venues.longitude,
      },
      court: { id: courts.id, name: courts.name },
    })
    .from(openPlaySessions)
    .innerJoin(venues, eq(venues.id, openPlaySessions.venueId))
    .innerJoin(courts, eq(courts.id, openPlaySessions.courtId))
    .where(
      and(
        eq(openPlaySessions.status, "published"),
        isNull(openPlaySessions.deletedAt),
        gte(openPlaySessions.startAt, from),
      ),
    )
    .orderBy(openPlaySessions.startAt)
    .limit(dbLimit);

  if (rows.length === 0) return [];

  const sessionIds = rows.map((r) => r.session.id);
  const counts = await exec
    .select({ sessionId: openPlaySignups.sessionId, c: count() })
    .from(openPlaySignups)
    .where(
      and(
        sql`${openPlaySignups.sessionId} in (${sql.join(
          sessionIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
        activeSignupWhere,
      ),
    )
    .groupBy(openPlaySignups.sessionId);
  const countMap = new Map(counts.map((c) => [c.sessionId, Number(c.c)]));
  const courtsMap = await listCourtsForSessions(sessionIds, exec);

  const items: SessionListItem[] = rows.map((r) => {
    const lat = r.venue.latitude !== null ? Number(r.venue.latitude) : null;
    const lng = r.venue.longitude !== null ? Number(r.venue.longitude) : null;
    const distanceKm =
      args.near && lat !== null && lng !== null
        ? haversineKm(args.near.lat, args.near.lng, lat, lng)
        : null;
    return {
      session: r.session,
      venue: {
        id: r.venue.id,
        name: r.venue.name,
        slug: r.venue.slug,
        city: r.venue.city,
        province: r.venue.province,
        coverImageUrl: r.venue.coverImageUrl,
      },
      court: r.court,
      courts: courtsMap.get(r.session.id) ?? [r.court],
      activeSignupCount: countMap.get(r.session.id) ?? 0,
      distanceKm,
    };
  });

  if (args.near) {
    items.sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
    return items.slice(0, limit);
  }

  return items;
}

/**
 * Owner list — every session for the given venue (any status, not soft-deleted),
 * newest start first.
 */
export async function listSessionsByVenue(
  venueId: string,
  exec: Executor = db,
): Promise<SessionListItem[]> {
  const rows = await exec
    .select({
      session: openPlaySessions,
      venue: {
        id: venues.id,
        name: venues.name,
        slug: venues.slug,
        city: venues.city,
        province: venues.province,
        coverImageUrl: venues.coverImageUrl,
      },
      court: { id: courts.id, name: courts.name },
    })
    .from(openPlaySessions)
    .innerJoin(venues, eq(venues.id, openPlaySessions.venueId))
    .innerJoin(courts, eq(courts.id, openPlaySessions.courtId))
    .where(
      and(eq(openPlaySessions.venueId, venueId), isNull(openPlaySessions.deletedAt)),
    )
    .orderBy(desc(openPlaySessions.startAt))
    .limit(200);

  if (rows.length === 0) return [];

  const sessionIds = rows.map((r) => r.session.id);
  const counts = await exec
    .select({ sessionId: openPlaySignups.sessionId, c: count() })
    .from(openPlaySignups)
    .where(
      and(
        sql`${openPlaySignups.sessionId} in (${sql.join(
          sessionIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
        activeSignupWhere,
      ),
    )
    .groupBy(openPlaySignups.sessionId);
  const countMap = new Map(counts.map((c) => [c.sessionId, Number(c.c)]));
  const courtsMap = await listCourtsForSessions(sessionIds, exec);

  return rows.map((r) => ({
    session: r.session,
    venue: r.venue,
    court: r.court,
    courts: courtsMap.get(r.session.id) ?? [r.court],
    activeSignupCount: countMap.get(r.session.id) ?? 0,
    distanceKm: null,
  }));
}

export async function listSessionsByOwner(
  ownerId: string,
  exec: Executor = db,
): Promise<SessionListItem[]> {
  const rows = await exec
    .select({
      session: openPlaySessions,
      venue: {
        id: venues.id,
        name: venues.name,
        slug: venues.slug,
        city: venues.city,
        province: venues.province,
        coverImageUrl: venues.coverImageUrl,
      },
      court: { id: courts.id, name: courts.name },
    })
    .from(openPlaySessions)
    .innerJoin(venues, eq(venues.id, openPlaySessions.venueId))
    .innerJoin(courts, eq(courts.id, openPlaySessions.courtId))
    .where(
      and(eq(venues.ownerId, ownerId), isNull(openPlaySessions.deletedAt)),
    )
    .orderBy(desc(openPlaySessions.startAt))
    .limit(200);

  if (rows.length === 0) return [];

  const sessionIds = rows.map((r) => r.session.id);
  const counts = await exec
    .select({ sessionId: openPlaySignups.sessionId, c: count() })
    .from(openPlaySignups)
    .where(
      and(
        sql`${openPlaySignups.sessionId} in (${sql.join(
          sessionIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
        activeSignupWhere,
      ),
    )
    .groupBy(openPlaySignups.sessionId);
  const countMap = new Map(counts.map((c) => [c.sessionId, Number(c.c)]));
  const courtsMap = await listCourtsForSessions(sessionIds, exec);

  return rows.map((r) => ({
    session: r.session,
    venue: r.venue,
    court: r.court,
    courts: courtsMap.get(r.session.id) ?? [r.court],
    activeSignupCount: countMap.get(r.session.id) ?? 0,
    distanceKm: null,
  }));
}

// ----------------------------------------------------------------------------
// Signups
// ----------------------------------------------------------------------------

export async function insertSignup(
  values: NewOpenPlaySignup,
  exec: Executor = db,
): Promise<OpenPlaySignup> {
  const rows = await exec.insert(openPlaySignups).values(values).returning();
  const inserted = rows[0];
  if (!inserted) throw new Error("insertSignup: no row returned");
  return inserted;
}

export async function findSignupById(
  signupId: string,
  exec: Executor = db,
): Promise<OpenPlaySignup | null> {
  const rows = await exec
    .select()
    .from(openPlaySignups)
    .where(eq(openPlaySignups.id, signupId))
    .limit(1);
  return rows[0] ?? null;
}

export async function countActiveSignups(
  sessionId: string,
  exec: Executor = db,
): Promise<number> {
  const rows = await exec
    .select({ c: count() })
    .from(openPlaySignups)
    .where(
      and(
        eq(openPlaySignups.sessionId, sessionId),
        activeSignupWhere,
      ),
    );
  return Number(rows[0]?.c ?? 0);
}

export async function updateSignup(
  signupId: string,
  expectedVersion: number,
  patch: Partial<
    Pick<
      OpenPlaySignup,
      | "status"
      | "cancelledAt"
      | "cancelledBy"
      | "cancellationReason"
      | "reminderSentAt"
      | "contactEmail"
    >
  >,
  exec: Executor = db,
): Promise<OpenPlaySignup | null> {
  const rows = await exec
    .update(openPlaySignups)
    .set(patch)
    .where(
      and(eq(openPlaySignups.id, signupId), eq(openPlaySignups.version, expectedVersion)),
    )
    .returning();
  return rows[0] ?? null;
}

export interface SignupListItem {
  signup: OpenPlaySignup;
  player: { id: string; displayName: string; email: string };
  paymentStatus: "none" | "submitted" | "verified" | "rejected" | "disputed";
  paymentId: string | null;
}

export async function listSignupsForSession(
  sessionId: string,
  exec: Executor = db,
): Promise<SignupListItem[]> {
  const rows = await exec
    .select({
      signup: openPlaySignups,
      player: {
        id: profiles.id,
        displayName: profiles.displayName,
        email: profiles.email,
      },
      paymentId: openPlaySignupPayments.id,
      paymentStatus: openPlaySignupPayments.status,
    })
    .from(openPlaySignups)
    .innerJoin(profiles, eq(profiles.id, openPlaySignups.playerId))
    .leftJoin(
      openPlaySignupPayments,
      eq(openPlaySignupPayments.signupId, openPlaySignups.id),
    )
    .where(eq(openPlaySignups.sessionId, sessionId))
    .orderBy(openPlaySignups.createdAt);

  return rows.map((r) => ({
    signup: r.signup,
    player: r.player,
    paymentStatus: r.paymentStatus ?? "none",
    paymentId: r.paymentId,
  }));
}

export interface PlayerSignupListItem {
  signup: OpenPlaySignup;
  session: OpenPlaySession;
  venue: Pick<Venue, "id" | "name" | "slug" | "city">;
  court: Pick<Court, "id" | "name">;
  courts: Array<Pick<Court, "id" | "name">>;
  paymentStatus: "none" | "submitted" | "verified" | "rejected" | "disputed";
}

export async function listSignupsForPlayer(
  playerId: string,
  exec: Executor = db,
): Promise<PlayerSignupListItem[]> {
  const rows = await exec
    .select({
      signup: openPlaySignups,
      session: openPlaySessions,
      venue: {
        id: venues.id,
        name: venues.name,
        slug: venues.slug,
        city: venues.city,
      },
      court: { id: courts.id, name: courts.name },
      paymentStatus: openPlaySignupPayments.status,
    })
    .from(openPlaySignups)
    .innerJoin(openPlaySessions, eq(openPlaySessions.id, openPlaySignups.sessionId))
    .innerJoin(venues, eq(venues.id, openPlaySessions.venueId))
    .innerJoin(courts, eq(courts.id, openPlaySessions.courtId))
    .leftJoin(
      openPlaySignupPayments,
      eq(openPlaySignupPayments.signupId, openPlaySignups.id),
    )
    .where(eq(openPlaySignups.playerId, playerId))
    .orderBy(desc(openPlaySignups.createdAt))
    .limit(100);

  const sessionIds = Array.from(new Set(rows.map((r) => r.session.id)));
  const courtsMap = await listCourtsForSessions(sessionIds, exec);

  return rows.map((r) => ({
    signup: r.signup,
    session: r.session,
    venue: r.venue,
    court: r.court,
    courts: courtsMap.get(r.session.id) ?? [r.court],
    paymentStatus: r.paymentStatus ?? "none",
  }));
}

/**
 * Cron: find signups whose payment window has elapsed and expire them.
 * Returns the count of expired rows so the caller can log it.
 */
export async function expirePendingSignups(
  exec: Executor = db,
): Promise<number> {
  const rows = await exec
    .update(openPlaySignups)
    .set({ status: "expired" })
    .where(
      and(
        eq(openPlaySignups.status, "pending_payment"),
        lte(openPlaySignups.paymentDueAt, sql`now()`),
      ),
    )
    .returning({ id: openPlaySignups.id });
  return rows.length;
}

// ----------------------------------------------------------------------------
// Signup payments
// ----------------------------------------------------------------------------

export async function insertSignupPayment(
  values: NewOpenPlaySignupPayment,
  exec: Executor = db,
): Promise<OpenPlaySignupPayment> {
  const rows = await exec.insert(openPlaySignupPayments).values(values).returning();
  const inserted = rows[0];
  if (!inserted) throw new Error("insertSignupPayment: no row returned");
  return inserted;
}

export async function findSignupPaymentById(
  paymentId: string,
  exec: Executor = db,
): Promise<OpenPlaySignupPayment | null> {
  const rows = await exec
    .select()
    .from(openPlaySignupPayments)
    .where(eq(openPlaySignupPayments.id, paymentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findSignupPaymentBySignupId(
  signupId: string,
  exec: Executor = db,
): Promise<OpenPlaySignupPayment | null> {
  const rows = await exec
    .select()
    .from(openPlaySignupPayments)
    .where(eq(openPlaySignupPayments.signupId, signupId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateSignupPayment(
  paymentId: string,
  expectedVersion: number,
  patch: Partial<
    Pick<
      OpenPlaySignupPayment,
      "status" | "verifiedBy" | "verifiedAt" | "rejectionReason"
    >
  >,
  exec: Executor = db,
): Promise<OpenPlaySignupPayment | null> {
  const rows = await exec
    .update(openPlaySignupPayments)
    .set(patch)
    .where(
      and(
        eq(openPlaySignupPayments.id, paymentId),
        eq(openPlaySignupPayments.version, expectedVersion),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

// ----------------------------------------------------------------------------
// Shadow booking helpers (the row that physically blocks the court)
// ----------------------------------------------------------------------------

export async function insertShadowBooking(
  values: NewBooking,
  exec: Executor = db,
): Promise<Booking> {
  const rows = await exec.insert(bookings).values(values).returning();
  const inserted = rows[0];
  if (!inserted) throw new Error("insertShadowBooking: no row returned");
  return inserted;
}

export async function cancelShadowBooking(
  shadowBookingId: string,
  cancelledBy: string,
  reason: string,
  exec: Executor = db,
): Promise<void> {
  await exec
    .update(bookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledBy,
      cancellationReason: reason,
    })
    .where(eq(bookings.id, shadowBookingId));
}

// ----------------------------------------------------------------------------
// Ledger writes (used by confirmSignupAndWriteLedger in service.ts).
// Duplicated from features/booking/repo so feature boundaries stay clean —
// the inserts are 1:1 against the same table.
// ----------------------------------------------------------------------------

export async function insertLedgerEntries(
  entries: NewLedgerEntry[],
  exec: Executor = db,
): Promise<void> {
  if (entries.length === 0) return;
  await exec.insert(ledgerEntries).values(entries);
}

/** Return the database's current time (single source of truth inside a tx). */
export async function getDatabaseNow(exec: Executor = db): Promise<Date> {
  const rows = await exec.execute<{ now: Date }>(sql`select now() as now`);
  const row = rows[0];
  if (!row) throw new Error("getDatabaseNow: no row returned");
  return new Date(row.now);
}

// ----------------------------------------------------------------------------
// Phase B: receipt auto-validation + SLA auto-confirm + nudges + late-confirm
// All helpers mirror features/booking/repo.ts so the two payment lifecycles
// stay byte-for-byte parallel. See AGENTS.md "Open Play payment parity".
// ----------------------------------------------------------------------------

/**
 * True if the same GCash reference number was used on any other signup payment
 * within the last `withinDays`. Anti-replay heuristic for refs.
 */
export async function findRecentSignupRefDuplicate(
  ref: string,
  withinDays: number,
  excludePaymentId: string | null,
  exec: Executor = db,
): Promise<boolean> {
  const intervalSql = sql.raw(`'${String(withinDays)} days'`);
  const rows = await exec
    .select({ id: openPlaySignupPayments.id })
    .from(openPlaySignupPayments)
    .where(
      and(
        eq(openPlaySignupPayments.gcashReferenceNumber, ref),
        gte(openPlaySignupPayments.submittedAt, sql<Date>`now() - interval ${intervalSql}`),
        ...(excludePaymentId
          ? [sql`${openPlaySignupPayments.id} <> ${excludePaymentId}::uuid`]
          : []),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * True if the same receipt image hash was used on any other signup payment
 * within the last `withinDays`. Anti-replay heuristic for images.
 */
export async function findRecentSignupHashReplay(
  hash: string,
  withinDays: number,
  excludePaymentId: string,
  exec: Executor = db,
): Promise<boolean> {
  const intervalSql = sql.raw(`'${String(withinDays)} days'`);
  const rows = await exec
    .select({ id: openPlaySignupPayments.id })
    .from(openPlaySignupPayments)
    .where(
      and(
        eq(openPlaySignupPayments.receiptHash, hash),
        gte(openPlaySignupPayments.submittedAt, sql<Date>`now() - interval ${intervalSql}`),
        sql`${openPlaySignupPayments.id} <> ${excludePaymentId}::uuid`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Signups whose SLA auto-confirm deadline has elapsed AND whose payment is
 * still submitted + heuristic-validated. Feeds the cron auto-confirm loop.
 */
export async function findSignupsDueForAutoConfirm(
  limit = 100,
  exec: Executor = db,
): Promise<
  Array<{
    signupId: string;
    signupVersion: number;
    paymentId: string;
    paymentVersion: number;
  }>
> {
  const rows = await exec
    .select({
      signupId: openPlaySignups.id,
      signupVersion: openPlaySignups.version,
      paymentId: openPlaySignupPayments.id,
      paymentVersion: openPlaySignupPayments.version,
    })
    .from(openPlaySignups)
    .innerJoin(
      openPlaySignupPayments,
      eq(openPlaySignupPayments.signupId, openPlaySignups.id),
    )
    .where(
      and(
        eq(openPlaySignups.status, "payment_submitted"),
        lte(openPlaySignups.autoConfirmAt, sql`now()`),
        eq(openPlaySignupPayments.status, "submitted"),
        sql`${openPlaySignupPayments.autoValidatedAt} is not null`,
      ),
    )
    .limit(limit);
  return rows;
}

/**
 * Owner nudge 1 (polite): signup payment submitted >2h ago, nudge unsent.
 */
export async function findSignupPaymentsDueForNudge1(
  limit = 100,
  exec: Executor = db,
): Promise<Array<{ paymentId: string; paymentVersion: number; signupId: string }>> {
  const rows = await exec
    .select({
      paymentId: openPlaySignupPayments.id,
      paymentVersion: openPlaySignupPayments.version,
      signupId: openPlaySignupPayments.signupId,
    })
    .from(openPlaySignupPayments)
    .where(
      and(
        eq(openPlaySignupPayments.status, "submitted"),
        isNull(openPlaySignupPayments.ownerNudge1SentAt),
        lte(openPlaySignupPayments.submittedAt, sql<Date>`now() - interval '2 hours'`),
      ),
    )
    .limit(limit);
  return rows;
}

/**
 * Owner nudge 2 (urgent): session starts in <2h and signup still unverified.
 */
export async function findSignupPaymentsDueForNudge2(
  limit = 100,
  exec: Executor = db,
): Promise<Array<{ paymentId: string; paymentVersion: number; signupId: string }>> {
  const rows = await exec
    .select({
      paymentId: openPlaySignupPayments.id,
      paymentVersion: openPlaySignupPayments.version,
      signupId: openPlaySignupPayments.signupId,
    })
    .from(openPlaySignupPayments)
    .innerJoin(openPlaySignups, eq(openPlaySignups.id, openPlaySignupPayments.signupId))
    .innerJoin(openPlaySessions, eq(openPlaySessions.id, openPlaySignups.sessionId))
    .where(
      and(
        eq(openPlaySignupPayments.status, "submitted"),
        isNull(openPlaySignupPayments.ownerNudge2SentAt),
        gt(openPlaySessions.startAt, sql`now()`),
        lte(openPlaySessions.startAt, sql<Date>`now() + interval '2 hours'`),
      ),
    )
    .limit(limit);
  return rows;
}

/**
 * Record the outcome of the 5 heuristic checks on a freshly-inserted signup
 * payment. When `failures` is empty, sets `auto_validated_at = now()`.
 */
export async function markSignupAutoValidated(
  paymentId: string,
  expectedVersion: number,
  failures: string[],
  exec: Executor = db,
): Promise<OpenPlaySignupPayment | null> {
  const rows = await exec
    .update(openPlaySignupPayments)
    .set({
      autoValidationFailures: failures,
      ...(failures.length === 0
        ? { autoValidatedAt: sql`now()` as unknown as Date }
        : {}),
    })
    .where(
      and(
        eq(openPlaySignupPayments.id, paymentId),
        eq(openPlaySignupPayments.version, expectedVersion),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

/**
 * Schedule (or clear) the SLA auto-confirm deadline on a signup. Optimistic.
 */
export async function setSignupAutoConfirmAt(
  signupId: string,
  expectedVersion: number,
  ts: Date | null,
  exec: Executor = db,
): Promise<OpenPlaySignup | null> {
  const rows = await exec
    .update(openPlaySignups)
    .set({ autoConfirmAt: ts })
    .where(
      and(
        eq(openPlaySignups.id, signupId),
        eq(openPlaySignups.version, expectedVersion),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function markSignupNudge1Sent(
  paymentId: string,
  expectedVersion: number,
  exec: Executor = db,
): Promise<OpenPlaySignupPayment | null> {
  const rows = await exec
    .update(openPlaySignupPayments)
    .set({ ownerNudge1SentAt: sql`now()` as unknown as Date })
    .where(
      and(
        eq(openPlaySignupPayments.id, paymentId),
        eq(openPlaySignupPayments.version, expectedVersion),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function markSignupNudge2Sent(
  paymentId: string,
  expectedVersion: number,
  exec: Executor = db,
): Promise<OpenPlaySignupPayment | null> {
  const rows = await exec
    .update(openPlaySignupPayments)
    .set({ ownerNudge2SentAt: sql`now()` as unknown as Date })
    .where(
      and(
        eq(openPlaySignupPayments.id, paymentId),
        eq(openPlaySignupPayments.version, expectedVersion),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function markSignupAutoConfirmed(
  paymentId: string,
  expectedVersion: number,
  reason: string,
  exec: Executor = db,
): Promise<OpenPlaySignupPayment | null> {
  const rows = await exec
    .update(openPlaySignupPayments)
    .set({
      autoConfirmedAt: sql`now()` as unknown as Date,
      autoConfirmedReason: reason,
    })
    .where(
      and(
        eq(openPlaySignupPayments.id, paymentId),
        eq(openPlaySignupPayments.version, expectedVersion),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function markSignupLateConfirmed(
  paymentId: string,
  expectedVersion: number,
  adminId: string,
  reason: string,
  exec: Executor = db,
): Promise<OpenPlaySignupPayment | null> {
  const rows = await exec
    .update(openPlaySignupPayments)
    .set({
      lateConfirmedAt: sql`now()` as unknown as Date,
      lateConfirmedBy: adminId,
      lateConfirmedReason: reason,
    })
    .where(
      and(
        eq(openPlaySignupPayments.id, paymentId),
        eq(openPlaySignupPayments.version, expectedVersion),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Admin-side: late-confirm queue. Open-play signups whose session has ended
// but payment is still in 'submitted'. Mirrors bookings-view equivalent.
// ---------------------------------------------------------------------------
export interface LateConfirmSignupCandidate {
  payment: Pick<
    OpenPlaySignupPayment,
    | "id"
    | "version"
    | "amountCentavos"
    | "gcashReferenceNumber"
    | "submittedAt"
    | "autoValidatedAt"
    | "autoValidationFailures"
  >;
  signup: { id: string };
  session: Pick<OpenPlaySession, "id" | "title" | "startAt" | "endAt">;
  venue: Pick<Venue, "id" | "name" | "slug">;
  playerDisplayName: string;
  ownerDisplayName: string;
}

export async function listLateConfirmSignupCandidates(
  limit = 100,
): Promise<LateConfirmSignupCandidate[]> {
  const rows = await db.execute<{
    payment_id: string;
    payment_version: number;
    amount_centavos: string;
    gcash_reference_number: string | null;
    submitted_at: Date;
    auto_validated_at: Date | null;
    auto_validation_failures: string[];
    signup_id: string;
    session_id: string;
    session_title: string;
    start_at: Date;
    end_at: Date;
    venue_id: string;
    venue_name: string;
    venue_slug: string;
    player_display_name: string;
    owner_display_name: string;
  }>(sql`
    select
      p.id as payment_id,
      p.version as payment_version,
      p.amount_centavos::text as amount_centavos,
      p.gcash_reference_number,
      p.submitted_at,
      p.auto_validated_at,
      p.auto_validation_failures,
      s.id as signup_id,
      sess.id as session_id,
      sess.title as session_title,
      sess.start_at,
      sess.end_at,
      v.id as venue_id,
      v.name as venue_name,
      v.slug as venue_slug,
      pp.display_name as player_display_name,
      po.display_name as owner_display_name
    from open_play_signup_payments p
    inner join open_play_signups s on s.id = p.signup_id
    inner join open_play_sessions sess on sess.id = s.session_id
    inner join venues v on v.id = sess.venue_id
    inner join profiles pp on pp.id = s.player_id
    inner join profiles po on po.id = v.owner_id
    where p.status = 'submitted'
      and s.status = 'payment_submitted'
      and sess.end_at <= now()
    order by sess.end_at asc
    limit ${limit}
  `);
  return rows.map((r) => ({
    payment: {
      id: r.payment_id,
      version: r.payment_version,
      amountCentavos: BigInt(r.amount_centavos),
      gcashReferenceNumber: r.gcash_reference_number,
      submittedAt: new Date(r.submitted_at),
      autoValidatedAt: r.auto_validated_at ? new Date(r.auto_validated_at) : null,
      autoValidationFailures: r.auto_validation_failures ?? [],
    },
    signup: { id: r.signup_id },
    session: {
      id: r.session_id,
      title: r.session_title,
      startAt: new Date(r.start_at),
      endAt: new Date(r.end_at),
    },
    venue: { id: r.venue_id, name: r.venue_name, slug: r.venue_slug },
    playerDisplayName: r.player_display_name,
    ownerDisplayName: r.owner_display_name,
  }));
}
