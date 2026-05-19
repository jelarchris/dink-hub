import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionUser } from "@/server/session";
import { getVenueWithCourtsForOwner } from "@/features/owner-venues/service";
import { OwnerVenueError } from "@/features/owner-venues/errors";
import { manilaUpcomingDays } from "@/lib/date";
import { env } from "@/lib/env";
import type { Court, Venue } from "@/db/schema";
import { ShareCardClient } from "./share-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Share availability · ${id.slice(0, 8)}` };
}

export default async function ShareAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getSessionUser();
  if (!profile) {
    redirect(`/sign-in?next=${encodeURIComponent(`/owner/venues/${id}/share`)}`);
  }
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

  const activeCourts = data.courts.filter((c) => c.isActive);
  if (activeCourts.length === 0) {
    return (
      <Container className="max-w-3xl py-4">
        <PageHeader
          back={{ href: `/owner/venues/${id}`, label: "Back to venue" }}
          kicker="Share availability"
          title={data.venue.name}
        />
        <Alert variant="info" title="No active courts yet">
          Add an active court before generating a share card.
          <Link href={`/owner/venues/${id}`} className="ml-2 underline">
            Manage courts
          </Link>
        </Alert>
      </Container>
    );
  }

  if (data.venue.status !== "active") {
    return (
      <Container className="max-w-3xl py-4">
        <PageHeader
          back={{ href: `/owner/venues/${id}`, label: "Back to venue" }}
          kicker="Share availability"
          title={data.venue.name}
        />
        <Alert variant="warning" title="Venue not live yet">
          Share cards link back to the public booking page, which is only available
          once your venue is approved.
        </Alert>
      </Container>
    );
  }

  const days = manilaUpcomingDays(14).map((d) => ({
    isoDate: d.isoDate,
    label: d.label,
    isToday: d.isToday,
  }));

  return (
    <Container className="max-w-5xl py-3 sm:py-4">
      <PageHeader
        back={{ href: `/owner/venues/${id}`, label: "Back to venue" }}
        kicker="Share availability"
        title={data.venue.name}
        subtitle="Generate a poster you can drop into Facebook, Messenger, or Instagram."
      />
      <ShareCardClient
        venueSlug={data.venue.slug}
        venueName={data.venue.name}
        days={days}
        courts={activeCourts.map((c) => ({ id: c.id, name: c.name }))}
        appUrl={env.NEXT_PUBLIC_APP_URL}
      />
    </Container>
  );
}

// Suppress unused-import lint for icons we hold for future polish
void ArrowLeft;
