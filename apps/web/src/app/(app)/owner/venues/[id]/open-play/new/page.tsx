import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { getVenueWithCourtsForOwner } from "@/features/owner-venues/service";
import { OwnerVenueError } from "@/features/owner-venues/errors";
import { SessionForm } from "./session-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New Open Play session" };

export default async function NewOpenPlaySessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getSessionUser();
  if (!profile) {
    redirect(`/sign-in?next=${encodeURIComponent(`/owner/venues/${id}/open-play/new`)}`);
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

  let data;
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
          back={{ href: `/owner/venues/${id}/open-play`, label: "Open Play" }}
          kicker="New session"
          title="No active courts"
        />
        <Alert variant="warning" title="Add a court first">
          Open Play needs at least one active court. Add one from your venue page, then come back.
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="max-w-3xl py-3 sm:py-4">
      <PageHeader
        back={{ href: `/owner/venues/${id}/open-play`, label: "Open Play" }}
        kicker="New session"
        title={`Create Open Play · ${data.venue.name}`}
        subtitle="Save as draft, then publish when you're ready. Publishing locks the court for the duration."
      />
      <SessionForm
        venueId={data.venue.id}
        courts={activeCourts.map((c) => ({ id: c.id, name: c.name }))}
      />
    </Container>
  );
}
