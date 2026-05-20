import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, MapPin, Plus, Share2 } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { venueMediaPublicUrl } from "@/lib/venue-media";
import { listVenuesForOwner } from "@/features/owner-venues/service";
import type { Venue } from "@/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your venues" };

export default async function OwnerVenuesPage() {
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent("/owner/venues")}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-4">
        <Alert variant="warning" title="Owner access required">
          Your account isn&apos;t set up as a venue owner.
        </Alert>
      </Container>
    );
  }

  const items = await listVenuesForOwner(profile.id);

  return (
    <Container className="py-3 sm:py-4">
      <PageHeader
        back={{ href: "/owner", label: "Owner" }}
        kicker="Venues"
        title={`${items.length} venue${items.length === 1 ? "" : "s"}`}
        action={
          <Link href="/owner/venues/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-4" /> Add venue
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-10 text-[var(--color-fg-subtle)]" />}
          title="No venues yet"
          description="Add your first venue to start accepting bookings."
          action={
            <Link href="/owner/venues/new">
              <Button>
                <Plus className="size-4" /> Add venue
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ venue, courtCount, activeCourtCount }) => (
            <li key={venue.id}>
              <VenueRow
                venue={venue}
                courtCount={courtCount}
                shareable={venue.status === "active" && activeCourtCount > 0}
              />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}

function VenueRow({
  venue,
  courtCount,
  shareable,
}: {
  venue: Venue;
  courtCount: number;
  shareable: boolean;
}) {
  const img = venueMediaPublicUrl(venue.coverImagePath) ?? venue.coverImageUrl;
  return (
    <div className="group relative">
      <Link
        href={`/owner/venues/${venue.id}`}
        className="block overflow-hidden rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--color-brand-100)] to-[var(--color-bg-muted)]">
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={venue.name} className="h-full w-full object-cover" />
          )}
          <span className="absolute right-2 top-2">
            <StatusBadge status={venue.status} />
          </span>
        </div>
        <div className="mt-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-sm font-semibold leading-tight group-hover:text-[var(--color-brand-700)]">
              {venue.name}
            </h3>
            <span className="shrink-0 text-[10px] uppercase text-[var(--color-fg-muted)]">
              {courtCount} court{courtCount === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)]">
            <MapPin className="size-3" />
            <span className="truncate">{venue.city}, {venue.province}</span>
          </p>
        </div>
      </Link>
      {shareable && (
        <Link
          href={`/owner/venues/${venue.id}/share`}
          aria-label={`Share availability for ${venue.name}`}
          title="Share availability"
          className="absolute left-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-white/95 text-[var(--color-brand-700)] shadow-sm ring-1 ring-black/5 backdrop-blur transition hover:bg-white hover:text-[var(--color-brand-800)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
        >
          <Share2 className="size-4" />
        </Link>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Venue["status"] }) {
  switch (status) {
    case "active":
      return <Badge variant="success">Active</Badge>;
    case "pending_review":
      return <Badge variant="info">In review</Badge>;
    case "suspended":
      return <Badge variant="danger">Suspended</Badge>;
    case "draft":
    default:
      return <Badge variant="neutral">Draft</Badge>;
  }
}
