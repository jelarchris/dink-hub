import "server-only";
import { and, asc, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { courts, reviews, venues, type Court, type Venue } from "@/db/schema";
import { venueMediaPublicUrl } from "@/lib/venue-media";
import { type AvailabilityFilter } from "./availability";

export type VenueSort = "name" | "price_asc" | "rating_desc";

/**
 * Read-only repo for the public venue browsing surface.
 * Only returns active, non-deleted venues + active, non-deleted courts.
 */

export interface VenueListItem {
  venue: Pick<
    Venue,
    | "id"
    | "name"
    | "slug"
    | "city"
    | "province"
    | "addressLine"
    | "coverImageUrl"
    | "description"
  >;
  courtCount: number;
  minHourlyRateCentavos: bigint | null;
  avgRating: number | null;
  reviewCount: number;
}

export interface ListActiveVenuesOptions {
  limit: number;
  offset?: number;
  /** Case-insensitive substring match on venue name. */
  query?: string;
  /** Exact city match. */
  city?: string;
  /** Default: name asc. */
  sort?: VenueSort;
}

export async function listActiveVenues(opts: ListActiveVenuesOptions): Promise<VenueListItem[]> {
  const wheres = [eq(venues.status, "active"), isNull(venues.deletedAt)];
  const trimmedQuery = opts.query?.trim();
  if (trimmedQuery) {
    // ILIKE with escaped wildcard chars to keep pure substring semantics.
    const escaped = trimmedQuery.replace(/[\\%_]/g, (c) => `\\${c}`);
    wheres.push(ilike(venues.name, `%${escaped}%`));
  }
  if (opts.city) {
    wheres.push(eq(venues.city, opts.city));
  }

  // Rating aggregate joined as a correlated subquery so the LEFT JOIN on
  // courts doesn't multiply review counts. Hidden reviews excluded.
  const ratingAgg = sql<string | null>`(
    select avg(${reviews.rating})::text
    from ${reviews}
    where ${reviews.venueId} = ${venues.id} and ${reviews.isHidden} = false
  )`;
  const reviewCountAgg = sql<number>`(
    select count(*)::int
    from ${reviews}
    where ${reviews.venueId} = ${venues.id} and ${reviews.isHidden} = false
  )`;

  const orderBy = (() => {
    switch (opts.sort) {
      case "price_asc":
        return [
          // NULLS LAST so venues with no courts sink to the bottom.
          sql`min(${courts.hourlyRateCentavos}) asc nulls last`,
          asc(venues.name),
        ];
      case "rating_desc":
        return [sql`${ratingAgg} desc nulls last`, asc(venues.name)];
      case "name":
      default:
        return [asc(venues.name)];
    }
  })();

  const rows = await db
    .select({
      id: venues.id,
      name: venues.name,
      slug: venues.slug,
      city: venues.city,
      province: venues.province,
      addressLine: venues.addressLine,
      coverImageUrl: venues.coverImageUrl,
      coverImagePath: venues.coverImagePath,
      description: venues.description,
      courtCount: sql<number>`count(${courts.id})::int`,
      minHourlyRateCentavos: sql<string | null>`min(${courts.hourlyRateCentavos})::text`,
      avgRating: ratingAgg,
      reviewCount: reviewCountAgg,
    })
    .from(venues)
    .leftJoin(
      courts,
      and(eq(courts.venueId, venues.id), eq(courts.isActive, true), isNull(courts.deletedAt)),
    )
    .where(and(...wheres))
    .groupBy(venues.id)
    .orderBy(...orderBy)
    .limit(opts.limit)
    .offset(opts.offset ?? 0);

  return rows.map((r) => ({
    venue: {
      id: r.id,
      name: r.name,
      slug: r.slug,
      city: r.city,
      province: r.province,
      addressLine: r.addressLine,
      coverImageUrl: venueMediaPublicUrl(r.coverImagePath) ?? r.coverImageUrl,
      description: r.description,
    },
    courtCount: r.courtCount,
    minHourlyRateCentavos: r.minHourlyRateCentavos !== null ? BigInt(r.minHourlyRateCentavos) : null,
    avgRating: r.avgRating !== null ? Number(r.avgRating) : null,
    reviewCount: r.reviewCount,
  }));
}

export interface CityOption {
  city: string;
  venueCount: number;
}

/** Distinct cities with at least one active, non-deleted venue. Ordered by venue count desc. */
export async function listActiveVenueCities(): Promise<CityOption[]> {
  const rows = await db
    .select({
      city: venues.city,
      venueCount: sql<number>`count(*)::int`,
    })
    .from(venues)
    .where(and(eq(venues.status, "active"), isNull(venues.deletedAt)))
    .groupBy(venues.city)
    .orderBy(desc(sql`count(*)`), asc(venues.city));
  return rows.map((r) => ({ city: r.city, venueCount: r.venueCount }));
}

export async function findActiveVenueBySlug(
  slug: string,
): Promise<{ venue: Venue; courts: Court[] } | null> {
  const venueRows = await db
    .select()
    .from(venues)
    .where(and(eq(venues.slug, slug), eq(venues.status, "active"), isNull(venues.deletedAt)))
    .limit(1);
  const venue = venueRows[0];
  if (!venue) return null;

  const courtRows = await db
    .select()
    .from(courts)
    .where(and(eq(courts.venueId, venue.id), eq(courts.isActive, true), isNull(courts.deletedAt)))
    .orderBy(asc(courts.name));

  // Derive a final coverImageUrl from the storage path when present.
  const venueWithImage: Venue = {
    ...venue,
    coverImageUrl: venueMediaPublicUrl(venue.coverImagePath) ?? venue.coverImageUrl,
  };

  return { venue: venueWithImage, courts: courtRows };
}

/**
 * Find all bookings + holds that occupy a court's time on a given date (UTC date span).
 * Used to render slot availability in the picker.
 */
export async function getCourtOccupancy(args: {
  courtId: string;
  fromUtc: Date;
  toUtc: Date;
}): Promise<{ ranges: Array<{ startAt: Date; endAt: Date; kind: "booking" | "hold" | "closure" }> }> {
  // Inline raw SQL for the union: faster + clearer than two queries.
  const result = await db.execute<{ start_at: Date; end_at: Date; kind: "booking" | "hold" | "closure" }>(sql`
    select start_at, end_at, 'booking'::text as kind
    from bookings
    where court_id = ${args.courtId}
      and status not in ('cancelled', 'no_show', 'expired')
      and start_at < ${args.toUtc.toISOString()}
      and end_at > ${args.fromUtc.toISOString()}
    union all
    select start_at, end_at, 'hold'::text as kind
    from slot_holds
    where court_id = ${args.courtId}
      and expires_at > now()
      and start_at < ${args.toUtc.toISOString()}
      and end_at > ${args.fromUtc.toISOString()}
    union all
    select start_at, end_at, 'closure'::text as kind
    from court_closures
    where court_id = ${args.courtId}
      and deleted_at is null
      and start_at < ${args.toUtc.toISOString()}
      and end_at > ${args.fromUtc.toISOString()}
  `);
  return {
    ranges: result.map((r) => ({
      startAt: new Date(r.start_at),
      endAt: new Date(r.end_at),
      kind: r.kind,
    })),
  };
}

/**
 * Batch variant of getCourtOccupancy: returns occupancy for many courts
 * across a single time window in one round-trip. Used by the booking page
 * to pre-load 14 days × N courts so client-side switching is instant.
 */
export async function getCourtsOccupancy(args: {
  courtIds: ReadonlyArray<string>;
  fromUtc: Date;
  toUtc: Date;
}): Promise<Array<{ courtId: string; startAt: Date; endAt: Date; kind: "booking" | "hold" | "closure" }>> {
  if (args.courtIds.length === 0) return [];
  const ids = sql.join(
    args.courtIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const result = await db.execute<{
    court_id: string;
    start_at: Date;
    end_at: Date;
    kind: "booking" | "hold" | "closure";
  }>(sql`
    select court_id, start_at, end_at, 'booking'::text as kind
    from bookings
    where court_id in (${ids})
      and status not in ('cancelled', 'no_show', 'expired')
      and start_at < ${args.toUtc.toISOString()}
      and end_at > ${args.fromUtc.toISOString()}
    union all
    select court_id, start_at, end_at, 'hold'::text as kind
    from slot_holds
    where court_id in (${ids})
      and expires_at > now()
      and start_at < ${args.toUtc.toISOString()}
      and end_at > ${args.fromUtc.toISOString()}
    union all
    select court_id, start_at, end_at, 'closure'::text as kind
    from court_closures
    where court_id in (${ids})
      and deleted_at is null
      and start_at < ${args.toUtc.toISOString()}
      and end_at > ${args.fromUtc.toISOString()}
  `);
  return result.map((r) => ({
    courtId: r.court_id,
    startAt: new Date(r.start_at),
    endAt: new Date(r.end_at),
    kind: r.kind,
  }));
}

export interface MarketplaceStats {
  venueCount: number;
  courtCount: number;
  bookingsLast7d: number;
}

/**
 * Aggregate counters used as social proof on the homepage. All scoped to
 * active, non-deleted records. Counted in a single round-trip via three
 * scalar subqueries — fast even without supporting indexes thanks to small
 * launch-market data volume.
 */
export async function getMarketplaceStats(): Promise<MarketplaceStats> {
  const result = await db.execute<{
    venue_count: number;
    court_count: number;
    bookings_last_7d: number;
  }>(sql`
    select
      (select count(*)::int from venues
        where status = 'active' and deleted_at is null) as venue_count,
      (select count(*)::int from courts c
        join venues v on v.id = c.venue_id
        where c.is_active = true and c.deleted_at is null
          and v.status = 'active' and v.deleted_at is null) as court_count,
      (select count(*)::int from bookings
        where status not in ('cancelled', 'no_show', 'expired')
          and created_at >= now() - interval '7 days') as bookings_last_7d
  `);
  const row = result[0];
  return {
    venueCount: row?.venue_count ?? 0,
    courtCount: row?.court_count ?? 0,
    bookingsLast7d: row?.bookings_last_7d ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Availability map
// ---------------------------------------------------------------------------

export interface VenueAvailability {
  totalCourts: number;
  availableCourts: number;
}

/**
 * For a set of venue IDs and an availability filter (date + time-of-day +
 * duration), returns how many of each venue's courts have at least one free
 * slot of `durationMin` minutes within the requested time window.
 *
 * Algorithm (gap detection):
 *   1. Collect all bookings that overlap the window per court.
 *   2. Build candidate free-slot start times: the window start + the end of
 *      each overlapping booking (capped to `windowEnd - duration`).
 *   3. For each candidate, verify no booking overlaps [candidate, candidate+dur].
 *   4. Courts with zero bookings in the window are free by definition.
 *
 * This is intentionally conservative — it correctly handles courts with
 * partial bookings inside the window (e.g., a 1-hr booking in a 4-hr window
 * leaves free slots before/after it).
 *
 * Relies on the partial index `bookings_avail_idx (court_id, start_at, end_at)
 * WHERE status NOT IN ('cancelled','no_show','expired')` added in 0016.
 */
export async function getVenueAvailabilityMap(
  venueIds: string[],
  filter: AvailabilityFilter,
): Promise<Map<string, VenueAvailability>> {
  if (venueIds.length === 0) return new Map();

  // Convert Manila local hours to UTC timestamps.
  // Manila is always UTC+8 (no DST). Date.UTC handles negative/overflow hours.
  const toUtc = (manilaHour: number): Date => {
    const [y, m, d] = filter.date.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!, manilaHour - 8, 0, 0, 0));
  };

  const windowStart = toUtc(filter.startH);
  const windowEnd = toUtc(filter.endH);

  // Guard: window must fit at least one slot of the requested duration.
  const windowMinutes = (windowEnd.getTime() - windowStart.getTime()) / 60_000;
  if (windowMinutes < filter.durationMin) return new Map();

  const idList = sql.join(
    venueIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const rows = await db.execute<{
    venue_id: string;
    total_courts: number;
    available_courts: number;
  }>(sql`
    WITH params AS (
        SELECT
            ${windowStart.toISOString()}::timestamptz          AS ws,
            ${windowEnd.toISOString()}::timestamptz            AS we,
            (${filter.durationMin}::int * INTERVAL '1 minute') AS dur
    ),
    -- Active courts scoped to the requested venues
    venue_courts AS (
        SELECT c.id AS court_id, c.venue_id
        FROM   courts c
        WHERE  c.venue_id IN (${idList})
          AND  c.is_active   = true
          AND  c.deleted_at  IS NULL
    ),
    -- All bookings that overlap the window for any of those courts.
    -- The partial index bookings_avail_idx (court_id, start_at, end_at) is used here.
    busy AS (
        SELECT b.court_id, b.start_at, b.end_at
        FROM   bookings      b
        JOIN   venue_courts  vc ON vc.court_id = b.court_id
        CROSS  JOIN params   p
        WHERE  b.status NOT IN ('cancelled', 'no_show', 'expired')
          AND  b.start_at <  p.we
          AND  b.end_at   >  p.ws
    ),
    -- Candidate free-slot start times per court:
    --   (a) the window start (ws) for every court that has ≥1 busy booking
    --   (b) the end of each booking, capped to (we - dur) so the slot fits
    candidates AS (
        SELECT DISTINCT vc.court_id, p.ws AS slot_start
        FROM   venue_courts vc
        JOIN   busy         b  ON b.court_id = vc.court_id
        CROSS  JOIN params  p
        UNION ALL
        SELECT b.court_id, LEAST(b.end_at, p.we - p.dur) AS slot_start
        FROM   busy        b
        CROSS  JOIN params p
    ),
    -- Courts where at least one candidate slot is fully unoccupied
    has_slot AS (
        SELECT DISTINCT c.court_id
        FROM   candidates  c
        CROSS  JOIN params p
        WHERE  c.slot_start + p.dur <= p.we
          AND  NOT EXISTS (
              SELECT 1
              FROM   busy b
              WHERE  b.court_id   = c.court_id
                AND  b.start_at   < c.slot_start + p.dur
                AND  b.end_at     > c.slot_start
          )
    ),
    -- Courts with zero bookings in the window (the entire window is free)
    free_courts AS (
        SELECT vc.court_id
        FROM   venue_courts vc
        CROSS  JOIN params  p
        WHERE  p.we - p.ws >= p.dur
          AND  NOT EXISTS (SELECT 1 FROM busy b WHERE b.court_id = vc.court_id)
    ),
    avail AS (
        SELECT court_id FROM has_slot
        UNION
        SELECT court_id FROM free_courts
    )
    SELECT
        vc.venue_id::text                   AS venue_id,
        COUNT(DISTINCT vc.court_id)::int    AS total_courts,
        COUNT(DISTINCT a.court_id)::int     AS available_courts
    FROM   venue_courts vc
    LEFT   JOIN avail a ON a.court_id = vc.court_id
    GROUP  BY vc.venue_id
  `);

  const map = new Map<string, VenueAvailability>();
  for (const row of rows) {
    map.set(row.venue_id, {
      totalCourts: Number(row.total_courts),
      availableCourts: Number(row.available_courts),
    });
  }
  return map;
}
