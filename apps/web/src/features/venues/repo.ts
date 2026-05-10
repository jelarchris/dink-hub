import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { courts, venues, type Court, type Venue } from "@/db/schema";
import { venueMediaPublicUrl } from "@/lib/venue-media";

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
}

export async function listActiveVenues(opts: {
  limit: number;
  offset?: number;
}): Promise<VenueListItem[]> {
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
    })
    .from(venues)
    .leftJoin(
      courts,
      and(eq(courts.venueId, venues.id), eq(courts.isActive, true), isNull(courts.deletedAt)),
    )
    .where(and(eq(venues.status, "active"), isNull(venues.deletedAt)))
    .groupBy(venues.id)
    .orderBy(asc(venues.name))
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
  }));
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
}): Promise<{ ranges: Array<{ startAt: Date; endAt: Date; kind: "booking" | "hold" }> }> {
  // Inline raw SQL for the union: faster + clearer than two queries.
  const result = await db.execute<{ start_at: Date; end_at: Date; kind: "booking" | "hold" }>(sql`
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
}): Promise<Array<{ courtId: string; startAt: Date; endAt: Date; kind: "booking" | "hold" }>> {
  if (args.courtIds.length === 0) return [];
  const ids = sql.join(
    args.courtIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const result = await db.execute<{
    court_id: string;
    start_at: Date;
    end_at: Date;
    kind: "booking" | "hold";
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
