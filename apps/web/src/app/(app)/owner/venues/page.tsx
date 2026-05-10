import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, MapPin, Plus } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { listVenuesForOwner } from "@/features/owner-venues/service";
import type { Venue } from "@/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your venues" };

export default async function OwnerVenuesPage() {
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent("/owner/venues")}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-10">
        <Alert variant="warning" title="Owner access required">
          Your account isn't set up as a venue owner.
        </Alert>
      </Container>
    );
  }

  const items = await listVenuesForOwner(profile.id);

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your venues</h1>
          <p className="text-[var(--color-fg-muted)]">
            Manage venue details and the courts players can book.
          </p>
        </div>
        <Link href="/owner/venues/new">
          <Button>
            <Plus className="size-4" /> Add venue
          </Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          className="mt-8"
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
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ venue, courtCount }) => (
            <VenueCard key={venue.id} venue={venue} courtCount={courtCount} />
          ))}
        </div>
      )}
    </Container>
  );
}

function VenueCard({ venue, courtCount }: { venue: Venue; courtCount: number }) {
  return (
    <Link href={`/owner/venues/${venue.id}`} className="group block">
      <Card className="overflow-hidden transition group-hover:border-[var(--color-brand-500)]">
        <div className="aspect-[16/9] w-full bg-gradient-to-br from-[var(--color-brand-100)] to-[var(--color-bg-muted)]" />
        <CardContent className="space-y-2 pt-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight">{venue.name}</h3>
            <StatusBadge status={venue.status} />
          </div>
          <p className="flex items-center gap-1 text-xs text-[var(--color-fg-muted)]">
            <MapPin className="size-3.5" /> {venue.city}, {venue.province}
          </p>
          <p className="text-xs text-[var(--color-fg-subtle)]">
            {courtCount} court{courtCount === 1 ? "" : "s"}
          </p>
        </CardContent>
      </Card>
    </Link>
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
