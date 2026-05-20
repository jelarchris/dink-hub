import "server-only";
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bookings,
  courtClosures,
  courts,
  payments,
  profiles,
  venues,
  type Booking,
  type Court,
  type Payment,
  type Profile,
  type Venue,
} from "@/db/schema";

export interface BookingDetail {
  booking: Booking;
  venue: Venue;
  court: Court;
  payment: Payment | null;
}

export async function findBookingDetailForPlayer(args: {
  bookingId: string;
  playerId: string;
}): Promise<BookingDetail | null> {
  const rows = await db
    .select({
      booking: bookings,
      venue: venues,
      court: courts,
      payment: payments,
    })
    .from(bookings)
    .innerJoin(venues, eq(venues.id, bookings.venueId))
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .leftJoin(payments, eq(payments.bookingId, bookings.id))
    .where(and(eq(bookings.id, args.bookingId), eq(bookings.playerId, args.playerId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { booking: r.booking, venue: r.venue, court: r.court, payment: r.payment };
}

export interface BookingListItem {
  booking: Pick<
    Booking,
    | "id"
    | "status"
    | "startAt"
    | "endAt"
    | "venueId"
    | "totalCentavos"
    | "courtFeeCentavos"
    | "systemFeeCentavos"
    | "cancellableUntil"
    | "paymentDueAt"
    | "createdAt"
  >;
  venue: Pick<Venue, "name" | "slug" | "city">;
  court: Pick<Court, "name">;
}

export async function listBookingsForPlayer(playerId: string): Promise<BookingListItem[]> {
  const rows = await db
    .select({
      booking: {
        id: bookings.id,
        status: bookings.status,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        venueId: bookings.venueId,
        totalCentavos: bookings.totalCentavos,
        courtFeeCentavos: bookings.courtFeeCentavos,
        systemFeeCentavos: bookings.systemFeeCentavos,
        cancellableUntil: bookings.cancellableUntil,
        paymentDueAt: bookings.paymentDueAt,
        createdAt: bookings.createdAt,
      },
      venue: { name: venues.name, slug: venues.slug, city: venues.city },
      court: { name: courts.name },
    })
    .from(bookings)
    .innerJoin(venues, eq(venues.id, bookings.venueId))
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .where(eq(bookings.playerId, playerId))
    .orderBy(desc(bookings.startAt))
    .limit(50);
  return rows;
}

// ---------------------------------------------------------------------------
// Owner-side reads: payment verification queue
// ---------------------------------------------------------------------------

export interface PendingPaymentRow {
  payment: Pick<
    Payment,
    | "id"
    | "status"
    | "amountCentavos"
    | "gcashReferenceNumber"
    | "receiptImagePath"
    | "submittedAt"
  >;
  booking: Pick<Booking, "id" | "startAt" | "endAt" | "totalCentavos" | "playerId">;
  venue: Pick<Venue, "id" | "name" | "slug">;
  court: Pick<Court, "name">;
  playerDisplayName: string;
}

export async function listPendingPaymentsForOwner(ownerId: string): Promise<PendingPaymentRow[]> {
  const rows = await db.execute<{
    payment_id: string;
    payment_status: string;
    amount_centavos: string;
    gcash_reference_number: string | null;
    receipt_image_path: string;
    submitted_at: Date;
    booking_id: string;
    start_at: Date;
    end_at: Date;
    total_centavos: string;
    player_id: string;
    venue_id: string;
    venue_name: string;
    venue_slug: string;
    court_name: string;
    player_display_name: string;
  }>(sql`
    select
      p.id as payment_id,
      p.status::text as payment_status,
      p.amount_centavos::text as amount_centavos,
      p.gcash_reference_number,
      p.receipt_image_path,
      p.submitted_at,
      b.id as booking_id,
      b.start_at,
      b.end_at,
      b.total_centavos::text as total_centavos,
      b.player_id,
      v.id as venue_id,
      v.name as venue_name,
      v.slug as venue_slug,
      c.name as court_name,
      pr.display_name as player_display_name
    from payments p
    inner join bookings b on b.id = p.booking_id
    inner join venues v on v.id = b.venue_id
    inner join courts c on c.id = b.court_id
    inner join profiles pr on pr.id = b.player_id
    where v.owner_id = ${ownerId}
      and p.status = 'submitted'
    order by p.submitted_at asc
    limit 100
  `);
  return rows.map((r) => ({
    payment: {
      id: r.payment_id,
      status: r.payment_status as Payment["status"],
      amountCentavos: BigInt(r.amount_centavos),
      gcashReferenceNumber: r.gcash_reference_number,
      receiptImagePath: r.receipt_image_path,
      submittedAt: new Date(r.submitted_at),
    },
    booking: {
      id: r.booking_id,
      startAt: new Date(r.start_at),
      endAt: new Date(r.end_at),
      totalCentavos: BigInt(r.total_centavos),
      playerId: r.player_id,
    },
    venue: { id: r.venue_id, name: r.venue_name, slug: r.venue_slug },
    court: { name: r.court_name },
    playerDisplayName: r.player_display_name,
  }));
}

export async function findPaymentByIdForOwner(args: {
  paymentId: string;
  ownerId: string;
}): Promise<{
  payment: Payment;
  booking: Booking;
  venue: Venue;
  court: Court;
} | null> {
  const rows = await db
    .select({ payment: payments, booking: bookings, venue: venues, court: courts })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .innerJoin(venues, eq(venues.id, bookings.venueId))
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .where(and(eq(payments.id, args.paymentId), eq(venues.ownerId, args.ownerId)))
    .limit(1);
  return rows[0] ?? null;
}

// ============================================================================
// owner — booking detail
// ============================================================================

export interface OwnerBookingDetail {
  booking: Booking;
  venue: Venue;
  court: Court;
  player: Pick<Profile, "id" | "displayName" | "email" | "phoneE164">;
  payment: Payment | null;
}

/**
 * Load a single booking scoped to the requesting owner.
 *
 * Returns null for both "not found" and "not your venue" to prevent
 * id-enumeration disclosure. The caller should render a 404.
 */
export async function findBookingForOwner(args: {
  bookingId: string;
  ownerId: string;
}): Promise<OwnerBookingDetail | null> {
  const rows = await db
    .select({
      booking: bookings,
      venue: venues,
      court: courts,
      player: {
        id: profiles.id,
        displayName: profiles.displayName,
        email: profiles.email,
        phoneE164: profiles.phoneE164,
      },
      payment: payments,
    })
    .from(bookings)
    .innerJoin(venues, and(eq(venues.id, bookings.venueId), isNull(venues.deletedAt)))
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .innerJoin(profiles, eq(profiles.id, bookings.playerId))
    .leftJoin(payments, eq(payments.bookingId, bookings.id))
    .where(and(eq(bookings.id, args.bookingId), eq(venues.ownerId, args.ownerId)))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    booking: r.booking,
    venue: r.venue,
    court: r.court,
    player: r.player,
    payment: r.payment,
  };
}

// ============================================================================
// Player dashboard data — single round-trip
// ============================================================================

export interface DashboardUpcoming {
  booking: Pick<Booking, "id" | "status" | "startAt" | "endAt" | "totalCentavos" | "paymentDueAt">;
  venue: Pick<Venue, "name" | "slug" | "city" | "addressLine">;
  court: Pick<Court, "name">;
  payment: Pick<Payment, "status"> | null;
}

export interface DashboardRecentItem {
  booking: Pick<Booking, "id" | "status" | "startAt" | "endAt" | "totalCentavos">;
  venue: Pick<Venue, "name" | "slug">;
  court: Pick<Court, "name">;
  hasReview: boolean;
}

export interface PlayerDashboardData {
  /** The next upcoming confirmed or payment-pending booking, if any. */
  upcoming: DashboardUpcoming | null;
  /** Last 5 past bookings (completed / cancelled). */
  recent: DashboardRecentItem[];
  stats: {
    totalSessions: number;
    totalHours: number;
    uniqueVenues: number;
    favoriteVenueSlug: string | null;
    favoriteVenueName: string | null;
  };
  /** Bookings that are confirmed, ended, and not yet reviewed. */
  pendingReviewBookingIds: string[];
}

export async function getPlayerDashboardData(playerId: string): Promise<PlayerDashboardData> {
  const now = new Date();

  // 1. Next upcoming booking (pending_payment | payment_submitted | confirmed, future)
  const upcomingRows = await db
    .select({
      booking: {
        id: bookings.id,
        status: bookings.status,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        totalCentavos: bookings.totalCentavos,
        paymentDueAt: bookings.paymentDueAt,
      },
      venue: {
        name: venues.name,
        slug: venues.slug,
        city: venues.city,
        addressLine: venues.addressLine,
      },
      court: { name: courts.name },
      payment: { status: payments.status },
    })
    .from(bookings)
    .innerJoin(venues, eq(venues.id, bookings.venueId))
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .leftJoin(payments, eq(payments.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.playerId, playerId),
        gt(bookings.endAt, now),
        sql`${bookings.status} not in ('cancelled','no_show','expired','refunded')`,
      ),
    )
    .orderBy(bookings.startAt)
    .limit(1);

  const upcomingRow = upcomingRows[0];
  const upcoming: DashboardUpcoming | null = upcomingRow
    ? {
        booking: upcomingRow.booking,
        venue: upcomingRow.venue,
        court: upcomingRow.court,
        payment: upcomingRow.payment,
      }
    : null;

  // 2. Recent past bookings (last 5, end_at in the past)
  const recentRows = await db
    .select({
      booking: {
        id: bookings.id,
        status: bookings.status,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        totalCentavos: bookings.totalCentavos,
      },
      venue: { name: venues.name, slug: venues.slug },
      court: { name: courts.name },
      hasReview: sql<boolean>`exists (
        select 1 from reviews r
        where r.booking_id = ${bookings.id}
      )`,
    })
    .from(bookings)
    .innerJoin(venues, eq(venues.id, bookings.venueId))
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .where(
      and(
        eq(bookings.playerId, playerId),
        lt(bookings.endAt, now),
        sql`${bookings.status} not in ('cancelled','no_show','expired')`,
      ),
    )
    .orderBy(desc(bookings.startAt))
    .limit(5);

  const recent: DashboardRecentItem[] = recentRows.map((r) => ({
    booking: r.booking,
    venue: r.venue,
    court: r.court,
    hasReview: r.hasReview,
  }));

  // 3. Aggregate stats — all confirmed/completed bookings ever
  const statsRows = await db
    .select({
      totalSessions: count(bookings.id).mapWith(Number),
      totalMinutes: sql<number>`coalesce(sum(extract(epoch from (${bookings.endAt} - ${bookings.startAt})) / 60), 0)::int`,
      uniqueVenues: sql<number>`count(distinct ${bookings.venueId})::int`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.playerId, playerId),
        eq(bookings.status, "confirmed"),
      ),
    );

  // Favorite venue (most sessions at)
  const favRows = await db
    .select({
      venueId: bookings.venueId,
      venueName: venues.name,
      venueSlug: venues.slug,
      sessionCount: count(bookings.id).mapWith(Number),
    })
    .from(bookings)
    .innerJoin(venues, eq(venues.id, bookings.venueId))
    .where(
      and(
        eq(bookings.playerId, playerId),
        eq(bookings.status, "confirmed"),
      ),
    )
    .groupBy(bookings.venueId, venues.name, venues.slug)
    .orderBy(sql`count(${bookings.id}) desc`)
    .limit(1);

  const statsRow = statsRows[0];
  const favRow = favRows[0];

  // 4. Pending review booking ids (confirmed, ended, no review yet)
  const pendingReviewRows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.playerId, playerId),
        eq(bookings.status, "confirmed"),
        lt(bookings.endAt, now),
        sql`not exists (select 1 from reviews r where r.booking_id = ${bookings.id})`,
      ),
    )
    .orderBy(desc(bookings.endAt))
    .limit(3);

  return {
    upcoming,
    recent,
    stats: {
      totalSessions: statsRow?.totalSessions ?? 0,
      totalHours: Math.round(((statsRow?.totalMinutes ?? 0) / 60) * 10) / 10,
      uniqueVenues: statsRow?.uniqueVenues ?? 0,
      favoriteVenueSlug: favRow?.venueSlug ?? null,
      favoriteVenueName: favRow?.venueName ?? null,
    },
    pendingReviewBookingIds: pendingReviewRows.map((r) => r.id),
  };
}

// ============================================================================
// Owner — booking history list
// ============================================================================

/**
 * UI-level filter categories for the owner bookings list.
 * "all" and "upcoming" are not real DB statuses — they map to multi-value queries.
 */
export type OwnerBookingStatusFilter =
  | "all"
  | "upcoming"
  | "confirmed"
  | "cancelled"
  | "no_show"
  | "expired"
  | "refunded";

export interface OwnerBookingListItem {
  booking: {
    id: string;
    status: Booking["status"];
    startAt: Date;
    endAt: Date;
    totalCentavos: bigint;
    createdAt: Date;
  };
  venue: { id: string; name: string; slug: string };
  court: { name: string };
  playerDisplayName: string;
  player: {
    email: string;
    phoneE164: string | null;
  };
}

const OWNER_BOOKINGS_PAGE_SIZE = 25;

/**
 * Paginated booking history for an owner across all their venues.
 *
 * Cursor is base64url-encoded JSON { startAt: ISO string, id: UUID }.
 * Results are ordered by startAt DESC, id DESC (newest first).
 * Fetches PAGE_SIZE + 1 rows to determine if a next page exists.
 */
export async function listBookingsForOwner(args: {
  ownerId: string;
  statusFilter?: OwnerBookingStatusFilter;
  venueId?: string;
  cursor?: string;
}): Promise<{ items: OwnerBookingListItem[]; nextCursor: string | null }> {
  const statusFilter = args.statusFilter ?? "all";
  const now = new Date();
  // Upcoming = soonest-first (ASC). Everything else = newest-first (DESC).
  const sortAsc = statusFilter === "upcoming";

  // Build the cursor condition from an opaque base64url token.
  let cursorCondition: ReturnType<typeof or> | undefined;
  if (args.cursor) {
    try {
      const { startAt, id } = JSON.parse(
        Buffer.from(args.cursor, "base64url").toString("utf8"),
      ) as { startAt: string; id: string };
      const cursorDate = new Date(startAt);
      cursorCondition = sortAsc
        ? or(
            gt(bookings.startAt, cursorDate),
            and(eq(bookings.startAt, cursorDate), gt(bookings.id, id)),
          )
        : or(
            lt(bookings.startAt, cursorDate),
            and(eq(bookings.startAt, cursorDate), lt(bookings.id, id)),
          );
    } catch {
      // Malformed cursor — ignore and serve from the beginning.
    }
  }

  // Status condition.
  let statusCondition: ReturnType<typeof inArray> | ReturnType<typeof eq> | undefined;
  if (statusFilter === "upcoming") {
    statusCondition = inArray(bookings.status, [
      "pending_payment",
      "payment_submitted",
      "confirmed",
    ]);
  } else if (statusFilter !== "all") {
    statusCondition = eq(bookings.status, statusFilter as Booking["status"]);
  }

  const rows = await db
    .select({
      booking: {
        id: bookings.id,
        status: bookings.status,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        totalCentavos: bookings.totalCentavos,
        createdAt: bookings.createdAt,
      },
      venue: { id: venues.id, name: venues.name, slug: venues.slug },
      court: { name: courts.name },
      playerDisplayName: profiles.displayName,
      playerEmail: profiles.email,
      playerPhoneE164: profiles.phoneE164,
    })
    .from(bookings)
    .innerJoin(venues, and(eq(venues.id, bookings.venueId), isNull(venues.deletedAt)))
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .innerJoin(profiles, eq(profiles.id, bookings.playerId))
    .where(
      and(
        eq(venues.ownerId, args.ownerId),
        args.venueId ? eq(venues.id, args.venueId) : undefined,
        statusCondition,
        // "upcoming" also requires startAt in the future.
        statusFilter === "upcoming" ? gte(bookings.startAt, now) : undefined,
        cursorCondition,
      ),
    )
    .orderBy(sortAsc ? asc(bookings.startAt) : desc(bookings.startAt), sortAsc ? asc(bookings.id) : desc(bookings.id))
    .limit(OWNER_BOOKINGS_PAGE_SIZE + 1);

  const hasMore = rows.length > OWNER_BOOKINGS_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, OWNER_BOOKINGS_PAGE_SIZE) : rows;

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = items[items.length - 1];
    if (last) {
      nextCursor = Buffer.from(
        JSON.stringify({ startAt: last.booking.startAt.toISOString(), id: last.booking.id }),
        "utf8",
      ).toString("base64url");
    }
  }

  return {
    items: items.map((r) => ({
      booking: r.booking,
      venue: r.venue,
      court: r.court,
      playerDisplayName: r.playerDisplayName,
      player: {
        email: r.playerEmail,
        phoneE164: r.playerPhoneE164,
      },
    })),
    nextCursor,
  };
}

// ============================================================================
// Owner — single-day grid view (date + venue + court → hourly cells)
// ============================================================================

export interface OwnerGridCourt {
  id: string;
  name: string;
  openHour: number;
  closeHour: number;
  hourlyRateCentavos: bigint;
}

export interface OwnerGridBooking {
  id: string;
  status: Booking["status"];
  startAt: Date;
  endAt: Date;
  totalCentavos: bigint;
  playerDisplayName: string;
  playerEmail: string;
  playerPhoneE164: string | null;
}

export interface OwnerGridClosure {
  id: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
}

export interface OwnerGridData {
  venue: Pick<Venue, "id" | "name" | "slug">;
  courts: OwnerGridCourt[];
  /** Bookings that overlap the requested day, scoped to the selected court. */
  bookings: OwnerGridBooking[];
  /** Closures that overlap the requested day, scoped to the selected court. */
  closures: OwnerGridClosure[];
}

/**
 * Loads everything the owner grid needs for one (venue, court, day) tuple.
 *
 * - Ownership is re-checked at the venue level — never trust the URL.
 * - `dayStart`/`dayEnd` are pre-computed UTC instants for the Manila day range.
 *   We pull any booking/closure whose interval overlaps the window so partial-day
 *   spans render correctly on tile boundaries.
 * - Cancelled / no_show / expired bookings are excluded — they leave the slot open.
 *   Refunded is included because the slot was historically taken.
 * - If `courtId` is undefined or not part of the venue, falls back to the first
 *   active court. Returns null only when the venue isn't owned or has no courts.
 */
export async function getOwnerGridData(args: {
  ownerId: string;
  venueId: string;
  courtId?: string | undefined;
  dayStartUtc: Date;
  dayEndUtc: Date;
}): Promise<OwnerGridData | null> {
  // 1. Verify venue ownership + load courts in parallel — both keyed by venueId,
  //    so a missing venue (RLS fail or not owned) just means an empty court list.
  const [venueRows, courtRows] = await Promise.all([
    db
      .select({ id: venues.id, name: venues.name, slug: venues.slug })
      .from(venues)
      .where(
        and(
          eq(venues.id, args.venueId),
          eq(venues.ownerId, args.ownerId),
          isNull(venues.deletedAt),
        ),
      )
      .limit(1),
    db
      .select({
        id: courts.id,
        name: courts.name,
        openHour: courts.openHour,
        closeHour: courts.closeHour,
        hourlyRateCentavos: courts.hourlyRateCentavos,
      })
      .from(courts)
      .where(
        and(
          eq(courts.venueId, args.venueId),
          eq(courts.isActive, true),
          isNull(courts.deletedAt),
        ),
      )
      .orderBy(asc(courts.name)),
  ]);
  const venue = venueRows[0];
  if (!venue) return null;

  if (courtRows.length === 0) {
    return { venue, courts: [], bookings: [], closures: [] };
  }

  // Resolve to a real court: requested if owned, else first.
  const selectedCourtId =
    args.courtId && courtRows.some((c) => c.id === args.courtId)
      ? args.courtId
      : courtRows[0]!.id;

  // 2. Bookings + closures overlapping [dayStart, dayEnd) for the selected court — parallel.
  const [bookingRows, closureRows] = await Promise.all([
    db
      .select({
        id: bookings.id,
        status: bookings.status,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        totalCentavos: bookings.totalCentavos,
        playerDisplayName: profiles.displayName,
        playerEmail: profiles.email,
        playerPhoneE164: profiles.phoneE164,
      })
      .from(bookings)
      .innerJoin(profiles, eq(profiles.id, bookings.playerId))
      .where(
        and(
          eq(bookings.courtId, selectedCourtId),
          lt(bookings.startAt, args.dayEndUtc),
          gt(bookings.endAt, args.dayStartUtc),
          sql`${bookings.status} not in ('cancelled','no_show','expired')`,
        ),
      )
      .orderBy(asc(bookings.startAt)),
    db
      .select({
        id: courtClosures.id,
        startAt: courtClosures.startAt,
        endAt: courtClosures.endAt,
        reason: courtClosures.reason,
      })
      .from(courtClosures)
      .where(
        and(
          eq(courtClosures.courtId, selectedCourtId),
          lt(courtClosures.startAt, args.dayEndUtc),
          gt(courtClosures.endAt, args.dayStartUtc),
          isNull(courtClosures.deletedAt),
        ),
      ),
  ]);

  return {
    venue,
    courts: courtRows,
    bookings: bookingRows,
    closures: closureRows,
  };
}
