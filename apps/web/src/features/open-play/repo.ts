import "server-only";
import { and, count, desc, eq, gt, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bookings,
  courtClosures,
  courts,
  openPlaySessions,
  openPlaySignupPayments,
  openPlaySignups,
  profiles,
  venues,
  type Booking,
  type Court,
  type NewBooking,
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
  court: Pick<Court, "id" | "name">;
  activeSignupCount: number;
}

/**
 * Public list — upcoming PUBLISHED sessions, ordered by start time.
 */
export async function listPublishedSessions(
  args: { fromAt?: Date; limit?: number } = {},
  exec: Executor = db,
): Promise<SessionListItem[]> {
  const from = args.fromAt ?? new Date();
  const limit = Math.min(args.limit ?? 50, 100);

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
      and(
        eq(openPlaySessions.status, "published"),
        isNull(openPlaySessions.deletedAt),
        gte(openPlaySessions.startAt, from),
      ),
    )
    .orderBy(openPlaySessions.startAt)
    .limit(limit);

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
        sql`${openPlaySignups.status} not in ('cancelled', 'expired')`,
      ),
    )
    .groupBy(openPlaySignups.sessionId);
  const countMap = new Map(counts.map((c) => [c.sessionId, Number(c.c)]));

  return rows.map((r) => ({
    session: r.session,
    venue: r.venue,
    court: r.court,
    activeSignupCount: countMap.get(r.session.id) ?? 0,
  }));
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
        sql`${openPlaySignups.status} not in ('cancelled', 'expired')`,
      ),
    )
    .groupBy(openPlaySignups.sessionId);
  const countMap = new Map(counts.map((c) => [c.sessionId, Number(c.c)]));

  return rows.map((r) => ({
    session: r.session,
    venue: r.venue,
    court: r.court,
    activeSignupCount: countMap.get(r.session.id) ?? 0,
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
        sql`${openPlaySignups.status} not in ('cancelled', 'expired')`,
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

  return rows.map((r) => ({
    signup: r.signup,
    session: r.session,
    venue: r.venue,
    court: r.court,
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
