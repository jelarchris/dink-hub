import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";
import { findActiveVenueBySlug, getCourtsOccupancy } from "@/features/venues";
import { fromManilaWallClock, manilaUpcomingDays } from "@/lib/date";
import { venueMediaPublicUrl } from "@/lib/venue-media";
import { BookingFlow } from "./booking-flow";

export const dynamic = "force-dynamic";

const DAYS_AHEAD = 14;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await findActiveVenueBySlug(slug);
  return { title: found ? `Book at ${found.venue.name}` : "Book a court" };
}

export default async function BookCourtPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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
  const occupancy = await getCourtsOccupancy({
    courtIds: courts.map((c) => c.id),
    fromUtc,
    toUtc,
  });

  return (
    <Container className="py-4 sm:py-6">
      <Link
        href={`/venues/${venue.slug}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" /> {venue.name}
      </Link>

      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Book a court</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{venue.name}</p>
      </div>

      <BookingFlow
        venueSlug={venue.slug}
        days={days.map((d) => ({ isoDate: d.isoDate, label: d.label, isToday: d.isToday }))}
        courts={courts.map((c) => ({
          id: c.id,
          name: c.name,
          surface: c.surface,
          isIndoor: c.isIndoor,
          hourlyRateCentavos: c.hourlyRateCentavos.toString(),
          imageUrl: venueMediaPublicUrl(c.imagePath),
        }))}
        occupancy={occupancy.map((r) => ({
          courtId: r.courtId,
          startAtIso: r.startAt.toISOString(),
          endAtIso: r.endAt.toISOString(),
        }))}
      />
    </Container>
  );
}
