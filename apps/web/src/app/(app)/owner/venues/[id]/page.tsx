import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ExternalLink, Plus } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPHP } from "@/lib/money";
import {
  getVenueWithCourtsForOwner,
  type OwnerVenueListItem,
} from "@/features/owner-venues/service";
import { OwnerVenueError } from "@/features/owner-venues/errors";
import { updateVenueAction } from "@/features/owner-venues/actions";
import { VenueForm } from "../venue-form";
import { VenuePublishCard } from "./publish-card";
import { CourtArchiveButton } from "./court-archive-button";
import type { Court, Venue } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Edit venue · ${id.slice(0, 8)}` };
}

export default async function EditVenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent(`/owner/venues/${id}`)}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-10">
        <Alert variant="warning" title="Owner access required">
          Your account isn't set up as a venue owner.
        </Alert>
      </Container>
    );
  }

  let data: { venue: Venue; courts: Court[] };
  try {
    data = await getVenueWithCourtsForOwner(id, profile.id);
  } catch (err) {
    if (err instanceof OwnerVenueError && err.code === "venue_not_found") notFound();
    if (err instanceof OwnerVenueError && err.code === "forbidden") {
      return (
        <Container className="py-10">
          <Alert variant="warning" title="Not your venue">
            You don't have access to this venue.
          </Alert>
        </Container>
      );
    }
    throw err;
  }

  const { venue, courts } = data;
  const activeCourts = courts.filter((c) => c.isActive);
  const archivedCourts = courts.filter((c) => !c.isActive);

  return (
    <Container className="max-w-4xl py-8">
      <Link
        href="/owner/venues"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ChevronLeft className="size-4" /> Back to venues
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{venue.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
            <StatusBadge status={venue.status} />
            <span>·</span>
            <span>{venue.city}, {venue.province}</span>
            {venue.status === "active" && (
              <>
                <span>·</span>
                <Link
                  href={`/venues/${venue.slug}`}
                  className="inline-flex items-center gap-1 text-[var(--color-brand-700)] hover:underline"
                >
                  View public page <ExternalLink className="size-3" />
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <VenuePublishCard venue={venue} courtCount={activeCourts.length} />

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Courts</CardTitle>
          <Link href={`/owner/venues/${venue.id}/courts/new`}>
            <Button size="sm">
              <Plus className="size-4" /> Add court
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {activeCourts.length === 0 && archivedCourts.length === 0 ? (
            <EmptyState
              title="No courts yet"
              description="Add at least one court before submitting your venue for review."
              action={
                <Link href={`/owner/venues/${venue.id}/courts/new`}>
                  <Button size="sm">
                    <Plus className="size-4" /> Add court
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {activeCourts.map((c) => (
                <CourtRow key={c.id} venueId={venue.id} court={c} />
              ))}
              {archivedCourts.length > 0 && (
                <>
                  <div className="mt-6 text-xs font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
                    Archived
                  </div>
                  {archivedCourts.map((c) => (
                    <CourtRow key={c.id} venueId={venue.id} court={c} />
                  ))}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Venue details</CardTitle>
        </CardHeader>
        <CardContent>
          <VenueForm action={updateVenueAction} mode="edit" initial={venue} />
        </CardContent>
      </Card>
    </Container>
  );
}

function CourtRow({ venueId, court }: { venueId: string; court: Court }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{court.name}</span>
          {!court.isActive && <Badge variant="neutral">Archived</Badge>}
          {court.isActive && (
            <Badge variant="success">{court.isIndoor ? "Indoor" : "Outdoor"} · {court.surface}</Badge>
          )}
        </div>
        <div className="text-xs text-[var(--color-fg-muted)]">
          {formatPHP(court.hourlyRateCentavos)} / hour
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/owner/venues/${venueId}/courts/${court.id}`}>
          <Button variant="outline" size="sm">Edit</Button>
        </Link>
        <CourtArchiveButton courtId={court.id} venueId={venueId} isActive={court.isActive} />
      </div>
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

// Re-export for module shape consistency.
export type { OwnerVenueListItem };
