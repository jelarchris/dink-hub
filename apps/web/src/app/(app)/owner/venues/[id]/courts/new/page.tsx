import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { getVenueWithCourtsForOwner } from "@/features/owner-venues/service";
import { OwnerVenueError } from "@/features/owner-venues/errors";
import { createCourtAction } from "@/features/owner-venues/actions";
import { CourtForm } from "../court-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add court" };

export default async function NewCourtPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent(`/owner/venues/${id}/courts/new`)}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-10">
        <Alert variant="warning" title="Owner access required">
          Your account isn&apos;t set up as a venue owner.
        </Alert>
      </Container>
    );
  }

  try {
    await getVenueWithCourtsForOwner(id, profile.id);
  } catch (err) {
    if (err instanceof OwnerVenueError && err.code === "venue_not_found") notFound();
    if (err instanceof OwnerVenueError && err.code === "forbidden") {
      return (
        <Container className="py-10">
          <Alert variant="warning" title="Not your venue">
            You don&apos;t have access to this venue.
          </Alert>
        </Container>
      );
    }
    throw err;
  }

  return (
    <Container className="max-w-2xl py-8">
      <Link
        href={`/owner/venues/${id}`}
        className="inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ChevronLeft className="size-4" /> Back to venue
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Add a court</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Court details</CardTitle>
        </CardHeader>
        <CardContent>
          <CourtForm action={createCourtAction} mode="create" venueId={id} />
        </CardContent>
      </Card>
    </Container>
  );
}
