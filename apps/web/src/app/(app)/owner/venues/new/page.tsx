import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
import { createVenueAction } from "@/features/owner-venues/actions";
import { VenueForm } from "../venue-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add venue" };

export default async function NewVenuePage() {
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent("/owner/venues/new")}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-4">
        <Alert variant="warning" title="Owner access required">
          Your account isn&apos;t set up as a venue owner.
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="max-w-3xl py-3 sm:py-4">
      <PageHeader
        back={{ href: "/owner/venues", label: "Venues" }}
        kicker="New venue"
        title="Add a venue"
        subtitle="Save it as a draft, then add courts before submitting for review."
      />
      <SectionLabel className="mb-2 block">Venue details</SectionLabel>
      <VenueForm action={createVenueAction} mode="create" />
    </Container>
  );
}
