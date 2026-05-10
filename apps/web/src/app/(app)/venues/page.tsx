import Link from "next/link";
import { MapPin, Search, Trophy } from "lucide-react";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listActiveVenues } from "@/features/venues";
import { formatPHP } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find a court" };

export default async function VenuesPage() {
  const venues = await listActiveVenues({ limit: 50 });

  return (
    <Container className="py-3 sm:py-4">
      <PageHeader
        kicker="Find a court"
        title="Venues near you"
        subtitle={`${venues.length} venue${venues.length === 1 ? "" : "s"} in Agusan del Sur`}
      />

      {venues.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No venues yet"
          description="We're just getting started. Check back soon — or list your venue and be among the first."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((v) => (
            <li key={v.venue.id}>
              <Link
                href={`/venues/${v.venue.slug}`}
                className="group block overflow-hidden rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--color-brand-300)] to-[var(--color-brand-600)]">
                  {v.venue.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.venue.coverImageUrl}
                      alt={v.venue.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-white/85">
                      <Trophy className="size-10" />
                    </div>
                  )}
                  <span className="absolute right-2 top-2 rounded-full bg-[var(--color-bg)]/90 px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-fg)]">
                    {v.courtCount} {v.courtCount === 1 ? "court" : "courts"}
                  </span>
                </div>
                <div className="mt-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="truncate text-sm font-semibold leading-tight group-hover:text-[var(--color-brand-700)]">
                      {v.venue.name}
                    </h2>
                    {v.minHourlyRateCentavos !== null && (
                      <span className="shrink-0 text-sm font-bold text-[var(--color-brand-700)]">
                        {formatPHP(v.minHourlyRateCentavos)}
                        <span className="ml-0.5 text-[10px] font-medium text-[var(--color-fg-muted)]">/hr</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)]">
                    <MapPin className="size-3" />
                    <span className="truncate">{v.venue.city}, {v.venue.province}</span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
