import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { isAdminError } from "@/features/admin";
import { getVenueDetail } from "@/features/admin/service";
import { formatDateTimeManila } from "@/lib/date";
import { VenueStatusBadge } from "../../_components/venue-status-badge";
import { VenueReviewForm } from "./venue-review-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminVenueDetailPage({ params }: PageProps) {
  const { id } = await params;

  let detail;
  try {
    detail = await getVenueDetail(id);
  } catch (err) {
    if (isAdminError(err) && err.code === "venue_not_found") notFound();
    throw err;
  }

  const { venue, owner, courtCount, bookingCount } = detail;

  return (
    <Container className="py-8">
      <Link
        href="/admin/venues"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" /> Back to venues
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{venue.name}</h1>
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)]">
            <MapPin className="size-3.5" /> {venue.addressLine}, {venue.city}, {venue.province}
          </p>
        </div>
        <VenueStatusBadge status={venue.status} />
      </div>

      {venue.status === "rejected" && venue.rejectionReason && (
        <Alert variant="danger" title="Rejection reason" className="mt-4">
          {venue.rejectionReason}
        </Alert>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-semibold">Details</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Row label="Slug" value={venue.slug} />
              <Row
                label="Coordinates"
                value={
                  venue.latitude && venue.longitude
                    ? `${venue.latitude}, ${venue.longitude}`
                    : "—"
                }
              />
              <Row label="GCash name" value={venue.gcashAccountName ?? "—"} />
              <Row label="GCash number" value={venue.gcashAccountNumber ?? "—"} />
              <Row label="Courts" value={String(courtCount)} />
              <Row label="Bookings (all-time)" value={String(bookingCount)} />
              <Row label="Created" value={formatDateTimeManila(venue.createdAt)} />
              <Row label="Last updated" value={formatDateTimeManila(venue.updatedAt)} />
            </dl>
            {venue.description && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
                  Description
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{venue.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <h2 className="font-semibold">Owner</h2>
              <div>
                <p className="text-sm font-medium">{owner.displayName}</p>
                <p className="text-xs text-[var(--color-fg-muted)]">{owner.email}</p>
              </div>
              {owner.phoneE164 && (
                <p className="text-xs text-[var(--color-fg-muted)]">{owner.phoneE164}</p>
              )}
              <Link
                href={`/admin/users/${owner.id}`}
                className="text-xs text-[var(--color-brand-700)] hover:underline"
              >
                Open user →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <h2 className="font-semibold">Review actions</h2>
              <VenueReviewForm
                venueId={venue.id}
                version={venue.version}
                status={venue.status}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </Container>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}
