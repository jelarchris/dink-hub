import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { findActiveVenueBySlug, getCourtOccupancy } from "@/features/venues";
import {
  fromManilaWallClock,
  manilaCalendarParts,
  manilaUpcomingDays,
} from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { SlotPicker } from "./slot-picker";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ date?: string; courtId?: string; duration?: string }>;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await findActiveVenueBySlug(slug);
  return {
    title: found ? found.venue.name : "Venue not found",
    description: found?.venue.description ?? undefined,
  };
}

export default async function VenuePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const found = await findActiveVenueBySlug(slug);
  if (!found) notFound();
  const { venue, courts } = found;

  if (courts.length === 0) {
    return (
      <Container className="py-10">
        <VenueHeader venue={venue} />
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-[var(--color-fg-muted)]">
            This venue has no active courts yet.
          </CardContent>
        </Card>
      </Container>
    );
  }

  // Pick the day + court (default: today + first court)
  const days = manilaUpcomingDays(7);
  const todayIso = days[0]!.isoDate;
  const selectedDateIso = sp.date && days.some((d) => d.isoDate === sp.date) ? sp.date : todayIso;
  const selectedCourt = courts.find((c) => c.id === sp.courtId) ?? courts[0]!;
  const durationMin = clampDuration(sp.duration);

  // Compute the day's UTC range (Manila midnight → next Manila midnight)
  const [y, m, d] = selectedDateIso.split("-").map(Number);
  const fromUtc = fromManilaWallClock(y!, m!, d!, 0, 0);
  const toUtc = fromManilaWallClock(y!, m!, d!, 24, 0);

  const { ranges } = await getCourtOccupancy({
    courtId: selectedCourt.id,
    fromUtc,
    toUtc,
  });

  // Strip server Date objects to ISO strings + bigints to strings for the client component.
  const occupancy = ranges.map((r) => ({
    startAtIso: r.startAt.toISOString(),
    endAtIso: r.endAt.toISOString(),
  }));

  return (
    <Container className="py-8">
      <Link
        href="/venues"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" /> All venues
      </Link>

      <VenueHeader venue={venue} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Pick your time</CardTitle>
          </CardHeader>
          <CardContent>
            <SlotPicker
              venueSlug={venue.slug}
              days={days}
              selectedDateIso={selectedDateIso}
              courts={courts.map((c) => ({
                id: c.id,
                name: c.name,
                surface: c.surface,
                isIndoor: c.isIndoor,
                hourlyRateCentavos: c.hourlyRateCentavos.toString(),
              }))}
              selectedCourtId={selectedCourt.id}
              durationMin={durationMin}
              occupancy={occupancy}
            />
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Court details</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-[var(--color-fg-muted)]">Surface</dt>
                  <dd className="font-medium capitalize">{selectedCourt.surface}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--color-fg-muted)]">Type</dt>
                  <dd className="font-medium">{selectedCourt.isIndoor ? "Indoor" : "Outdoor"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--color-fg-muted)]">Hourly rate</dt>
                  <dd className="font-semibold">{formatPHP(selectedCourt.hourlyRateCentavos)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {venue.gcashAccountName && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="flex items-center gap-2">
                  <Phone className="size-4 text-[var(--color-fg-muted)]" />
                  <span className="font-medium">GCash · {venue.gcashAccountName}</span>
                </p>
                <p className="text-[var(--color-fg-muted)]">
                  After you pick a time, you&apos;ll get the payment number and 15 minutes to send the
                  receipt.
                </p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </Container>
  );
}

function clampDuration(raw: string | undefined): 30 | 60 | 90 | 120 | 180 | 240 {
  const n = Number(raw);
  if ([30, 60, 90, 120, 180, 240].includes(n)) return n as 30 | 60 | 90 | 120 | 180 | 240;
  return 60;
}

function VenueHeader({
  venue,
}: {
  venue: {
    name: string;
    description: string | null;
    addressLine: string;
    city: string;
    province: string;
    coverImageUrl: string | null;
  };
}) {
  return (
    <div>
      <div
        className="h-44 w-full rounded-[var(--radius-lg)] bg-gradient-to-br from-[var(--color-brand-300)] to-[var(--color-brand-700)] bg-cover bg-center sm:h-56"
        style={
          venue.coverImageUrl
            ? { backgroundImage: `url(${JSON.stringify(venue.coverImageUrl)})` }
            : undefined
        }
        aria-hidden="true"
      />
      <div className="mt-4 flex flex-col gap-1.5">
        <Badge variant="success" className="self-start">
          Open
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">{venue.name}</h1>
        <p className="flex items-center gap-1 text-sm text-[var(--color-fg-muted)]">
          <MapPin className="size-4" />
          {venue.addressLine}, {venue.city}, {venue.province}
        </p>
        {venue.description && <p className="mt-2 max-w-2xl text-[var(--color-fg)]">{venue.description}</p>}
      </div>
    </div>
  );
}

// Touch unused import to avoid stripping
void manilaCalendarParts;
