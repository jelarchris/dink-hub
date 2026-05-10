import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { createVenueAction } from "@/features/owner-venues/actions";
import { VenueForm } from "../venue-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add venue" };

export default async function NewVenuePage() {
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent("/owner/venues/new")}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-10">
        <Alert variant="warning" title="Owner access required">
          Your account isn't set up as a venue owner.
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="max-w-3xl py-8">
      <Link
        href="/owner/venues"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ChevronLeft className="size-4" /> Back to venues
      </Link>

      <h1 className="mt-2 text-2xl font-bold tracking-tight">Add a venue</h1>
      <p className="text-[var(--color-fg-muted)]">
        Save it as a draft first, then add courts before submitting for review.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Venue details</CardTitle>
        </CardHeader>
        <CardContent>
          <VenueForm action={createVenueAction} mode="create" />
        </CardContent>
      </Card>
    </Container>
  );
}
