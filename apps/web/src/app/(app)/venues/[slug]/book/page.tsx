import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { and, eq, inArray } from "drizzle-orm";
import { Container } from "@/components/ui/container";
import { db } from "@/db/client";
import { bookings, courts as courtsTable } from "@/db/schema";
import { findActiveVenueBySlug, getCourtsOccupancy } from "@/features/venues";
import { findCurrentSystemFeeCentavos, findCourtRateBands } from "@/features/booking/repo";
import { listOpenPlayForCourts } from "@/features/open-play";
import { fromManilaWallClock, manilaUpcomingDays } from "@/lib/date";
import { venueMediaPublicUrl } from "@/lib/venue-media";
import { getSessionUser } from "@/server/session";
import { BookingFlow } from "./booking-flow";

export const dynamic = "force-dynamic";

const DAYS_AHEAD = 14;

const FREE_REBOOK_CATEGORIES = ["venue_closure", "weather", "court_unavailable"] as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await findActiveVenueBySlug(slug);
  return { title: found ? `Book at ${found.venue.name}` : "Book a court" };
}

export default async function BookCourtPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rebook?: string }>;
}) {
  const { slug } = await params;
  const { rebook: rebookParam } = await searchParams;
  const found = await findActiveVenueBySlug(slug);
  if (!found) notFound();
  const { venue, courts } = found;
  if (courts.length === 0) notFound();

  const days = manilaUpcomingDays(DAYS_AHEAD);
  // Pre-load occupancy across the entire 14-day window for every court so
  // client-side switching never hits the network.
  const firstDay = days[0]!;
  const lastDay = days[days.length - 1]!;
  const [fy, fm, fd] = firstDay.isoDate.split("-").map(Number);
  const [ly, lm, ld] = lastDay.isoDate.split("-").map(Number);
  const fromUtc = fromManilaWallClock(fy!, fm!, fd!, 0, 0);
  const toUtc = fromManilaWallClock(ly!, lm!, ld!, 24, 0);
  const [occupancy, openPlay, player, systemFee, allRateBands] = await Promise.all([
    getCourtsOccupancy({
      courtIds: courts.map((c) => c.id),
      fromUtc,
      toUtc,
    }),
    listOpenPlayForCourts({
      courtIds: courts.map((c) => c.id),
      fromAt: fromUtc,
      toAt: toUtc,
    }),
    getSessionUser(),
    findCurrentSystemFeeCentavos(),
    Promise.all(courts.map((c) => findCourtRateBands(c.id).then((bands) => ({ courtId: c.id, bands })))),
  ]);

  // Free-rebook context: if ?rebook=<id> points to a player-owned, cancelled,
  // free-rebookable booking at this venue with no active rebook child, surface
  // it so the picker locks duration + skips payment.
  let rebookContext: {
    parentBookingId: string;
    expectedDurationMinutes: number;
    originalStartIso: string;
    originalCourtName: string;
    totalCentavos: string;
  } | undefined;
  if (rebookParam && player) {
    const parentRows = await db
      .select({
        id: bookings.id,
        playerId: bookings.playerId,
        venueId: bookings.venueId,
        courtId: bookings.courtId,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        status: bookings.status,
        cancellationCategory: bookings.cancellationCategory,
        totalCentavos: bookings.totalCentavos,
      })
      .from(bookings)
      .where(eq(bookings.id, rebookParam))
      .limit(1);
    const parent = parentRows[0];
    if (
      parent &&
      parent.playerId === player.id &&
      parent.venueId === venue.id &&
      parent.status === "cancelled" &&
      parent.cancellationCategory !== null &&
      (FREE_REBOOK_CATEGORIES as readonly string[]).includes(parent.cancellationCategory)
    ) {
      const childRows = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.rebookOfId, parent.id),
            inArray(bookings.status, ["pending_payment", "payment_submitted", "confirmed"]),
          ),
        )
        .limit(1);
      if (childRows.length === 0) {
        const courtRow = await db
          .select({ name: courtsTable.name })
          .from(courtsTable)
          .where(eq(courtsTable.id, parent.courtId))
          .limit(1);
        rebookContext = {
          parentBookingId: parent.id,
          expectedDurationMinutes: Math.round(
            (parent.endAt.getTime() - parent.startAt.getTime()) / 60_000,
          ),
          originalStartIso: parent.startAt.toISOString(),
          originalCourtName: courtRow[0]?.name ?? "court",
          totalCentavos: parent.totalCentavos.toString(),
        };
      }
    }
  }

  return (
    <Container className="py-2 sm:py-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={`/venues/${venue.slug}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-fg)] hover:text-[var(--color-brand-700)]"
        >
          <ArrowLeft className="size-4" /> {venue.name}
        </Link>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
          Book a court
        </span>
      </div>

      <BookingFlow
        venueSlug={venue.slug}
        venueName={venue.name}
        gcashAccountName={venue.gcashAccountName}
        gcashAccountNumber={venue.gcashAccountNumber}
        allowPartialPayment={venue.allowPartialPayment}
        depositPercent={venue.depositPercent}
        systemFeeEstimateCentavos={(systemFee ?? 0n).toString()}
        playerName={player?.displayName ?? ""}
        playerEmail={player?.email ?? ""}
        playerPhone={player?.phoneE164 ?? ""}
        isAuthenticated={Boolean(player)}
        days={days.map((d) => ({ isoDate: d.isoDate, label: d.label, isToday: d.isToday }))}
        courts={courts.map((c) => {
          const rateBandsForCourt = allRateBands.find((r) => r.courtId === c.id)?.bands ?? [];
          return {
            id: c.id,
            name: c.name,
            surface: c.surface,
            isIndoor: c.isIndoor,
            hourlyRateCentavos: c.hourlyRateCentavos.toString(),
            openHour: c.openHour,
            closeHour: c.closeHour,
            imageUrl: venueMediaPublicUrl(c.imagePath),
            rateBands: rateBandsForCourt.map((b) => ({
              fromHour: b.fromHour,
              toHour: b.toHour,
              rateCentavos: b.rateCentavos.toString(),
            })),
          };
        })}
        occupancy={occupancy.map((r) => ({
          courtId: r.courtId,
          startAtIso: r.startAt.toISOString(),
          endAtIso: r.endAt.toISOString(),
          kind: r.kind,
        }))}
        openPlay={openPlay.map((r) => ({
          sessionId: r.sessionId,
          courtId: r.courtId,
          startAtIso: r.startAt.toISOString(),
          endAtIso: r.endAt.toISOString(),
          title: r.title,
          capacity: r.capacity,
          activeSignupCount: r.activeSignupCount,
          pricePerPlayerCentavos: r.pricePerPlayerCentavos.toString(),
        }))}
        {...(rebookContext ? { rebookContext } : {})}
      />
    </Container>
  );
}
