import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { isAdminError } from "@/features/admin";
import { getBookingDetail } from "@/features/admin/service";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { ForceCancelForm } from "./force-cancel-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminBookingDetailPage({ params }: PageProps) {
  const { id } = await params;

  let detail;
  try {
    detail = await getBookingDetail(id);
  } catch (err) {
    if (isAdminError(err)) notFound();
    throw err;
  }

  const { booking, player, venueName, courtName, payment } = detail;
  const isTerminal =
    booking.status === "cancelled" ||
    booking.status === "expired" ||
    booking.status === "refunded";

  return (
    <Container className="py-8">
      <Link
        href="/admin/bookings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" /> Back to bookings
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {venueName} · {courtName}
          </h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {formatDateTimeManila(booking.startAt)} – {formatDateTimeManila(booking.endAt)}
          </p>
        </div>
        <Badge variant="neutral">{booking.status}</Badge>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-semibold">Booking</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Row label="Court fee" value={formatPHP(booking.courtFeeCentavos)} />
              <Row label="System fee" value={formatPHP(booking.systemFeeCentavos)} />
              <Row label="Total" value={formatPHP(booking.totalCentavos)} />
              <Row
                label="Cancellable until"
                value={formatDateTimeManila(booking.cancellableUntil)}
              />
              <Row
                label="Payment due"
                value={formatDateTimeManila(booking.paymentDueAt)}
              />
              <Row label="Created" value={formatDateTimeManila(booking.createdAt)} />
            </dl>
            {booking.notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{booking.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 pt-6">
              <h2 className="font-semibold">Player</h2>
              <Link
                href={`/admin/users/${player.id}`}
                className="text-sm font-medium text-[var(--color-brand-700)] hover:underline"
              >
                {player.displayName}
              </Link>
              <p className="text-xs text-[var(--color-fg-muted)]">{player.email}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 pt-6">
              <h2 className="font-semibold">Payment</h2>
              {payment ? (
                <>
                  <p className="text-sm">
                    Status: <Badge variant="neutral">{payment.status}</Badge>
                  </p>
                  <p className="text-xs text-[var(--color-fg-muted)]">
                    Submitted {formatDateTimeManila(payment.submittedAt)}
                  </p>
                  {payment.gcashReferenceNumber && (
                    <p className="text-xs">Ref: {payment.gcashReferenceNumber}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-[var(--color-fg-muted)]">No payment yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <h2 className="font-semibold">Force-cancel</h2>
              {isTerminal ? (
                <Alert variant="info" className="text-xs">
                  Booking is in a terminal state and cannot be cancelled.
                </Alert>
              ) : (
                <ForceCancelForm
                  bookingId={booking.id}
                  version={booking.version}
                />
              )}
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
