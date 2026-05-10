import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { getCourtForOwner } from "@/features/owner-venues/service";
import { OwnerVenueError } from "@/features/owner-venues/errors";
import { updateCourtAction } from "@/features/owner-venues/actions";
import { CourtForm } from "../court-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit court" };

export default async function EditCourtPage({
  params,
}: {
  params: Promise<{ id: string; courtId: string }>;
}) {
  const { id, courtId } = await params;
  const profile = await getSessionUser();
  if (!profile) {
    redirect(`/sign-in?next=${encodeURIComponent(`/owner/venues/${id}/courts/${courtId}`)}`);
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

  let court;
  try {
    const data = await getCourtForOwner(courtId, profile.id);
    court = data.court;
    if (data.venue.id !== id) notFound();
  } catch (err) {
    if (err instanceof OwnerVenueError && err.code === "court_not_found") notFound();
    if (err instanceof OwnerVenueError && err.code === "forbidden") {
      return (
        <Container className="py-4">
          <Alert variant="warning" title="Not your court">
            You don&apos;t have access to this court.
          </Alert>
        </Container>
      );
    }
    throw err;
  }

  return (
    <Container className="max-w-2xl py-3 sm:py-4">
      <PageHeader
        back={{ href: `/owner/venues/${id}`, label: "Back to venue" }}
        kicker="Edit court"
        title={court.name}
      />
      <CourtForm
        action={updateCourtAction}
        mode="edit"
        venueId={id}
        initial={court}
      />
    </Container>
  );
}
