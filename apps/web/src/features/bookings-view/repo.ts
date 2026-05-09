import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bookings,
  courts,
  payments,
  venues,
  type Booking,
  type Court,
  type Payment,
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
