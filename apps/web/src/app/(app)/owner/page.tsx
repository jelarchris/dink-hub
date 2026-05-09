import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Layers } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { listPendingPaymentsForOwner } from "@/features/bookings-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner dashboard" };

export default async function OwnerDashboard() {
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent("/owner")}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-10">
        <Alert variant="warning" title="Owner access required">
          Your account isn't set up as a venue owner. Contact us to list a venue.
        </Alert>
      </Container>
    );
  }

  const pending = await listPendingPaymentsForOwner(profile.id);

  return (
    <Container className="py-8">
      <h1 className="text-2xl font-bold tracking-tight">Welcome, {profile.displayName}</h1>
      <p className="text-[var(--color-fg-muted)]">
        You have <strong>{pending.length}</strong> payment{pending.length === 1 ? "" : "s"} waiting for verification.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-5" /> Verify payments
            </CardTitle>
            <CardDescription>
              Confirm receipts so bookings move to <strong>confirmed</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/owner/payments">
              <Button>{pending.length > 0 ? `Review ${pending.length} pending` : "Open queue"}</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-5" /> Your venues
            </CardTitle>
            <CardDescription>
              Venue and court setup is currently managed via DinkHub admin. Reach out to add or edit a venue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              Coming soon
            </Button>
          </CardContent>
        </Card>
      </div>
    </Container>
  );
}
