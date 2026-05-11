import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, Plus } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
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
import { ClosureForm } from "./closure-form";
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
      <Container className="py-4">
        <Alert variant="warning" title="Owner access required">
          Your account isn&apos;t set up as a venue owner.
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
        <Container className="py-4">
          <Alert variant="warning" title="Not your venue">
            You don&apos;t have access to this venue.
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
    <Container className="max-w-4xl py-3 sm:py-4">
      <PageHeader
        back={{ href: "/owner/venues", label: "Venues" }}
        kicker="Edit venue"
        title={venue.name}
        subtitle={`${venue.city}, ${venue.province}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={venue.status} />
            {venue.status === "active" && (
              <Link
                href={`/venues/${venue.slug}`}
                className="inline-flex items-center gap-1 text-xs text-[var(--color-brand-700)] hover:underline"
              >
                View public <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
        }
      />

      <VenuePublishCard venue={venue} courtCount={activeCourts.length} />

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Courts</SectionLabel>
          <Link
            href={`/owner/venues/${venue.id}/courts/new`}
            className={buttonVariants({ size: "sm" })}
          >
            <Plus className="size-4" /> Add court
          </Link>
        </div>
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
          <ul className="divide-y divide-[var(--color-border-default)] border-y border-[var(--color-border-default)]">
            {activeCourts.map((c) => (
              <CourtRow key={c.id} venueId={venue.id} court={c} />
            ))}
            {archivedCourts.length > 0 && (
              <>
                <li className="pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
                  Archived
                </li>
                {archivedCourts.map((c) => (
                  <CourtRow key={c.id} venueId={venue.id} court={c} />
                ))}
              </>
            )}
          </ul>
        )}
      </div>

      {/* Bulk closure — only relevant for active venues with at least one active court */}
      {venue.status === "active" && activeCourts.length > 0 && (
        <div className="mt-4">
          <ClosureForm
            venueId={venue.id}
            courts={activeCourts.map((c) => ({ id: c.id, name: c.name }))}
          />
        </div>
      )}

      <div className="mt-5">
        <SectionLabel className="mb-2 block">Venue details</SectionLabel>
        <VenueForm action={updateVenueAction} mode="edit" initial={venue} />
      </div>
    </Container>
  );
}

function CourtRow({ venueId, court }: { venueId: string; court: Court }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{court.name}</span>
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
        <Link
          href={`/owner/venues/${venueId}/courts/${court.id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Edit
        </Link>
        <CourtArchiveButton courtId={court.id} venueId={venueId} isActive={court.isActive} />
      </div>
    </li>
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

export type { OwnerVenueListItem };
