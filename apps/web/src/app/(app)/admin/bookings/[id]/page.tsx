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
import { OpenDisputeForm, ResolveDisputeForm } from "./dispute-forms";

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
    <Container className="py-3 sm:py-4">
      <Link
        href="/admin/bookings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" /> Back to bookings
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
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

          {payment && payment.status === "verified" && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <h2 className="font-semibold">Open dispute</h2>
                <p className="text-xs text-[var(--color-fg-muted)]">
                  {booking.status === "confirmed"
                    ? "Flags this payment for review. Booking stays confirmed until resolution."
                    : "Flags this verified payment for review so an admin can resolve the refund or reject the dispute."}
                </p>
                <OpenDisputeForm
                  paymentId={payment.id}
                  version={payment.version}
                />
              </CardContent>
            </Card>
          )}

          {payment && payment.status === "disputed" && (
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <h2 className="font-semibold">Disputed</h2>
                  {payment.disputeReason && (
                    <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                      Reason: {payment.disputeReason}
                    </p>
                  )}
                  {payment.disputeOpenedAt && (
                    <p className="text-xs text-[var(--color-fg-muted)]">
                      Opened {formatDateTimeManila(payment.disputeOpenedAt)}
                    </p>
                  )}
                </div>
                <div className="space-y-3 border-t border-[var(--color-border-default)] pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
                    Refund player
                  </p>
                  <p className="text-xs text-[var(--color-fg-muted)]">
                    Marks booking refunded and writes reversal ledger entries.
                  </p>
                  <ResolveDisputeForm
                    paymentId={payment.id}
                    version={payment.version}
                    resolution="refund_full"
                  />
                </div>
                <div className="space-y-3 border-t border-[var(--color-border-default)] pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
                    Reject dispute
                  </p>
                  <p className="text-xs text-[var(--color-fg-muted)]">
                    Returns payment to verified. No ledger changes.
                  </p>
                  <ResolveDisputeForm
                    paymentId={payment.id}
                    version={payment.version}
                    resolution="rejected"
                  />
                </div>
              </CardContent>
            </Card>
          )}

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
