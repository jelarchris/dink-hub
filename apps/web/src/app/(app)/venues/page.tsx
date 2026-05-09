import Link from "next/link";
import { MapPin, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { listActiveVenues } from "@/features/venues";
import { formatPHP } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find a court" };

export default async function VenuesPage() {
  const venues = await listActiveVenues({ limit: 50 });

  return (
    <Container className="py-10">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Find a court</h1>
        <p className="text-[var(--color-fg-muted)]">
          Pickleball venues in Agusan del Sur. Tap one to see availability.
        </p>
      </div>

      {venues.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No venues yet"
          description="We're just getting started. Check back soon — or list your venue and be among the first."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((v) => (
            <li key={v.venue.id}>
              <Link
                href={`/venues/${v.venue.slug}`}
                className="group block h-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
              >
                <div
                  className="aspect-[16/9] w-full bg-gradient-to-br from-[var(--color-brand-300)] to-[var(--color-brand-600)] bg-cover bg-center"
                  style={
                    v.venue.coverImageUrl
                      ? { backgroundImage: `url(${JSON.stringify(v.venue.coverImageUrl)})` }
                      : undefined
                  }
                  aria-hidden="true"
                />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold leading-tight group-hover:text-[var(--color-brand-700)]">
                      {v.venue.name}
                    </h2>
                    <Badge variant="success">{v.courtCount} {v.courtCount === 1 ? "court" : "courts"}</Badge>
                  </div>
                  <p className="mt-2 flex items-start gap-1 text-sm text-[var(--color-fg-muted)]">
                    <MapPin className="mt-0.5 size-4 shrink-0" />
                    <span className="line-clamp-2">
                      {v.venue.addressLine}, {v.venue.city}
                    </span>
                  </p>
                  {v.minHourlyRateCentavos !== null && (
                    <p className="mt-3 text-sm">
                      <span className="text-[var(--color-fg-muted)]">From </span>
                      <span className="font-semibold">{formatPHP(v.minHourlyRateCentavos)}</span>
                      <span className="text-[var(--color-fg-muted)]"> / hour</span>
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
