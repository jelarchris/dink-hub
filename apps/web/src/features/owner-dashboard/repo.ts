import "server-only";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, courts, profiles, venues } from "@/db/schema";

// Manila is UTC+8 fixed — no DST.
const MANILA_OFFSET_MS = 8 * 3_600_000;
const MS_PER_DAY = 86_400_000;

/**
 * Compute time-range boundaries relative to "now", expressed as UTC Dates.
 *
 * All arithmetic is done in Manila wall-clock (shift by +8h, truncate to day
 * or Monday boundary, shift back) to match the operator's local experience.
 *
 * `upcomingEndUTC` is the end of the upcoming window (days days from today)
 * used by getUpcomingSchedule.
 */
function getManilaTimeBoundaries(upcomingDays = 7): {
  todayStartUTC: Date;
  todayEndUTC: Date;
  thisWeekStartUTC: Date;
  lastWeekStartUTC: Date;
  upcomingEndUTC: Date;
} {
  const nowMs = Date.now();
  const nowManilaMs = nowMs + MANILA_OFFSET_MS;

  // Manila today midnight expressed as a UTC epoch (floor to day boundary).
  const todayManilaFloorMs = Math.floor(nowManilaMs / MS_PER_DAY) * MS_PER_DAY;
  const todayStartUTC = new Date(todayManilaFloorMs - MANILA_OFFSET_MS);
  const todayEndUTC = new Date(todayManilaFloorMs + MS_PER_DAY - MANILA_OFFSET_MS);

  // Manila this-week Monday 00:00 as UTC.
  const dayOfWeek = new Date(nowManilaMs).getUTCDay(); // 0 = Sun
  const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon → 0 … Sun → 6
  const thisWeekStartManilaMs = todayManilaFloorMs - daysSinceMonday * MS_PER_DAY;
  const thisWeekStartUTC = new Date(thisWeekStartManilaMs - MANILA_OFFSET_MS);

  // Last week: the 7-day window immediately preceding this week.
  const lastWeekStartUTC = new Date(thisWeekStartManilaMs - 7 * MS_PER_DAY - MANILA_OFFSET_MS);

  // Upcoming window: today 00:00 Manila → N days later (exclusive).
  const upcomingEndUTC = new Date(
    todayManilaFloorMs + upcomingDays * MS_PER_DAY - MANILA_OFFSET_MS,
  );

  return { todayStartUTC, todayEndUTC, thisWeekStartUTC, lastWeekStartUTC, upcomingEndUTC };
}

/** Format a UTC Date as a Manila-wall-clock date string "YYYY-MM-DD". */
export function toManilaDayKey(d: Date): string {
  const manilaMs = d.getTime() + MANILA_OFFSET_MS;
  return new Date(manilaMs).toISOString().slice(0, 10);
}

// ============================================================================
// dashboard stats
// ============================================================================

export interface OwnerDashboardStats {
  bookingsToday: number;
  grossTodayCentavos: bigint;
  bookingsThisWeek: number;
  grossThisWeekCentavos: bigint;
  /** Same metrics for the prior 7-day window — used to compute WoW deltas. */
  bookingsLastWeek: number;
  grossLastWeekCentavos: bigint;
  /** No-show count this week (Mon 00:00 Manila → now). */
  noShowsThisWeek: number;
}

/**
 * Return confirmed-booking counts and gross revenue for:
 *   - today (Manila calendar day)
 *   - this week (Mon 00:00 Manila → now)
 *   - last week (same window 7 days prior)
 *
 * All four queries run in parallel. Scoped to the owner's venues; optionally
 * filtered to a single venue via `venueId`.
 */
export async function getOwnerDashboardStats(
  ownerId: string,
  venueId?: string | undefined,
): Promise<OwnerDashboardStats> {
  const { todayStartUTC, todayEndUTC, thisWeekStartUTC, lastWeekStartUTC } =
    getManilaTimeBoundaries();

  // Optional single-venue filter — shared across all four sub-queries.
  const venueFilter = venueId ? eq(bookings.venueId, venueId) : undefined;

  const [todayRow, thisWeekRow, lastWeekRow, noShowRow] = await Promise.all([
    db
      .select({
        n: sql<number>`count(*)::int`,
        gross: sql<string>`coalesce(sum(${bookings.courtFeeCentavos}), 0)`.mapWith(String),
      })
      .from(bookings)
      .innerJoin(venues, eq(venues.id, bookings.venueId))
      .where(
        and(
          eq(venues.ownerId, ownerId),
          eq(bookings.status, "confirmed"),
          gte(bookings.startAt, todayStartUTC),
          lt(bookings.startAt, todayEndUTC),
          isNull(venues.deletedAt),
          venueFilter,
        ),
      ),
    db
      .select({
        n: sql<number>`count(*)::int`,
        gross: sql<string>`coalesce(sum(${bookings.courtFeeCentavos}), 0)`.mapWith(String),
      })
      .from(bookings)
      .innerJoin(venues, eq(venues.id, bookings.venueId))
      .where(
        and(
          eq(venues.ownerId, ownerId),
          eq(bookings.status, "confirmed"),
          gte(bookings.startAt, thisWeekStartUTC),
          isNull(venues.deletedAt),
          venueFilter,
        ),
      ),
    db
      .select({
        n: sql<number>`count(*)::int`,
        gross: sql<string>`coalesce(sum(${bookings.courtFeeCentavos}), 0)`.mapWith(String),
      })
      .from(bookings)
      .innerJoin(venues, eq(venues.id, bookings.venueId))
      .where(
        and(
          eq(venues.ownerId, ownerId),
          eq(bookings.status, "confirmed"),
          gte(bookings.startAt, lastWeekStartUTC),
          lt(bookings.startAt, thisWeekStartUTC),
          isNull(venues.deletedAt),
          venueFilter,
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .innerJoin(venues, eq(venues.id, bookings.venueId))
      .where(
        and(
          eq(venues.ownerId, ownerId),
          eq(bookings.status, "no_show"),
          gte(bookings.startAt, thisWeekStartUTC),
          isNull(venues.deletedAt),
          venueFilter,
        ),
      ),
  ]);

  return {
    bookingsToday: todayRow[0]?.n ?? 0,
    grossTodayCentavos: BigInt(todayRow[0]?.gross ?? "0"),
    bookingsThisWeek: thisWeekRow[0]?.n ?? 0,
    grossThisWeekCentavos: BigInt(thisWeekRow[0]?.gross ?? "0"),
    bookingsLastWeek: lastWeekRow[0]?.n ?? 0,
    grossLastWeekCentavos: BigInt(lastWeekRow[0]?.gross ?? "0"),
    noShowsThisWeek: noShowRow[0]?.n ?? 0,
  };
}

// ============================================================================
// upcoming schedule — today + next N days
// ============================================================================

export interface ScheduleItem {
  bookingId: string;
  startAt: Date;
  endAt: Date;
  venueId: string;
  venueName: string;
  courtName: string;
  playerDisplayName: string;
  totalCentavos: bigint;
  /**
   * Manila calendar date string "YYYY-MM-DD" for this booking's start time.
   * Use this to group rows into day buckets on the UI without re-doing
   * timezone math in the render layer.
   */
  manilaDateKey: string;
}

/**
 * All confirmed bookings starting today (Manila 00:00) through the next
 * `days` calendar days for venues owned by `ownerId`, ordered chronologically.
 *
 * Optionally scoped to a single venue via `venueId`.
 *
 * The returned `manilaDateKey` ("YYYY-MM-DD") is pre-computed in the query
 * using Postgres `AT TIME ZONE 'Asia/Manila'` so the page never does tz math.
 * Capped at 200 rows — well above any realistic 7-day load.
 */
export async function getUpcomingSchedule(
  ownerId: string,
  { venueId, days = 7 }: { venueId?: string; days?: number } = {},
): Promise<ScheduleItem[]> {
  const { todayStartUTC, upcomingEndUTC } = getManilaTimeBoundaries(days);
  const venueFilter = venueId ? eq(bookings.venueId, venueId) : undefined;

  const rows = await db
    .select({
      bookingId: bookings.id,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      venueId: venues.id,
      venueName: venues.name,
      courtName: courts.name,
      playerDisplayName: profiles.displayName,
      totalCentavos: bookings.totalCentavos,
      // Pre-compute the Manila date key in Postgres — avoids JS tz math.
      manilaDateKey: sql<string>`to_char(${bookings.startAt} at time zone 'Asia/Manila', 'YYYY-MM-DD')`,
    })
    .from(bookings)
    .innerJoin(venues, and(eq(venues.id, bookings.venueId), isNull(venues.deletedAt)))
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .innerJoin(profiles, eq(profiles.id, bookings.playerId))
    .where(
      and(
        eq(venues.ownerId, ownerId),
        eq(bookings.status, "confirmed"),
        gte(bookings.startAt, todayStartUTC),
        lt(bookings.startAt, upcomingEndUTC),
        isNull(venues.deletedAt),
        venueFilter,
      ),
    )
    .orderBy(bookings.startAt)
    .limit(200);

  return rows;
}

// ============================================================================
// court utilization this week
// ============================================================================

export interface CourtUtilization {
  courtId: string;
  courtName: string;
  venueId: string;
  venueName: string;
  /** Total confirmed booking minutes this week (Mon 00:00 Manila → now). */
  bookedMinutes: number;
  bookingCount: number;
}

/**
 * Per-court confirmed booking minutes for the current week (Mon → now, Manila).
 *
 * Uses a LEFT JOIN so courts with zero bookings this week still appear —
 * they show up with bookedMinutes = 0 and act as a visual reminder that
 * the court is idle. Only active (non-archived, non-deleted) courts are returned.
 *
 * Ordered descending by booked minutes so the busiest courts appear first.
 * The booking date filter is placed in the ON clause (not WHERE) to preserve
 * LEFT JOIN semantics — moving it to WHERE would implicitly make it an INNER JOIN.
 */
export async function getCourtUtilizationThisWeek(
  ownerId: string,
  venueId?: string,
): Promise<CourtUtilization[]> {
  const { thisWeekStartUTC } = getManilaTimeBoundaries();
  const venueFilter = venueId ? eq(courts.venueId, venueId) : undefined;

  const rows = await db
    .select({
      courtId: courts.id,
      courtName: courts.name,
      venueId: venues.id,
      venueName: venues.name,
      bookedMinutes:
        sql<number>`coalesce(sum(extract(epoch from (${bookings.endAt} - ${bookings.startAt})) / 60), 0)::int`,
      bookingCount: sql<number>`count(${bookings.id})::int`,
    })
    .from(courts)
    .innerJoin(venues, and(eq(venues.id, courts.venueId), isNull(venues.deletedAt)))
    .leftJoin(
      bookings,
      and(
        eq(bookings.courtId, courts.id),
        eq(bookings.status, "confirmed"),
        gte(bookings.startAt, thisWeekStartUTC),
      ),
    )
    .where(
      and(
        eq(venues.ownerId, ownerId),
        eq(courts.isActive, true),
        isNull(courts.deletedAt),
        venueFilter,
      ),
    )
    .groupBy(courts.id, courts.name, venues.id, venues.name)
    .orderBy(
      sql`coalesce(sum(extract(epoch from (${bookings.endAt} - ${bookings.startAt})) / 60), 0) desc`,
      courts.name,
    );

  return rows;
}
