import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  XCircle,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatPHP } from "@/lib/money";
import { formatDateManila, formatDateTimeManila, formatTimeManila } from "@/lib/date";
import { findBookingDetailForPlayer } from "@/features/bookings-view";
import { findReviewForBooking } from "@/features/reviews/service";
import { getReceiptSignedUrl } from "@/features/storage";
import type { Payment } from "@/db/schema";
import { CancelBookingButton } from "../cancel-button";
import { LeaveReviewForm } from "../_components/leave-review-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `Booking · ${id.slice(0, 8)}` };
}

export default async function PlayerBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent(`/me/bookings/${id}`)}`);
  if (profile.role !== "player") redirect("/me");

  // findBookingDetailForPlayer enforces playerId = profile.id — ownership checked server-side.
  const detail = await findBookingDetailForPlayer({ bookingId: id, playerId: profile.id });
  if (!detail) notFound();

  const { booking, venue, court, payment } = detail;

  // Server-side request timestamp — RSC renders once per request so this is stable.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const cancellable =
    ["pending_payment", "payment_submitted", "confirmed"].includes(booking.status) &&
    booking.cancellableUntil.getTime() > now;
  const isReviewable = booking.status === "confirmed" && booking.endAt.getTime() < now;
  const existingReview = isReviewable ? await findReviewForBooking(booking.id) : null;
  const alreadyReviewed = existingReview !== null;

  const receiptUrl =
    payment?.receiptImagePath
      ? await getReceiptSignedUrl(payment.receiptImagePath, 300)
      : null;

  const durationMin = (booking.endAt.getTime() - booking.startAt.getTime()) / 60_000;

  return (
    <Container className="max-w-3xl py-3 sm:py-4">
      {booking.status === "payment_submitted" && <AutoRefresh intervalMs={10_000} />}

      <PageHeader
        back={{ href: "/me/bookings", label: "My bookings" }}
        kicker="Booking"
        title={`${venue.name} · ${formatDateManila(booking.startAt)}`}
        subtitle={`${formatTimeManila(booking.startAt)} – ${formatTimeManila(booking.endAt)} · ${durationMin} min`}
        action={<BookingStatusBadge status={booking.status} />}
      />

      <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_260px]">
        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Status alerts */}
          {booking.status === "pending_payment" && (
            <Alert variant="warning" icon={<Clock />} title="Payment needed">
              Pay before{" "}
              <strong>{formatDateTimeManila(booking.paymentDueAt)}</strong> to
              hold your slot. The booking will expire after that.
            </Alert>
          )}
          {booking.status === "payment_submitted" && (
            <Alert variant="info" icon={<Clock />} title="Receipt uploaded — pending venue review">
              Your receipt has been sent to the venue. Confirmation usually
              arrives within minutes.
            </Alert>
          )}
          {booking.status === "confirmed" && booking.startAt.getTime() > now && (
            <Alert variant="success" icon={<CheckCircle2 />} title="Booking confirmed">
              You&apos;re all set. Just show up with your paddle.
            </Alert>
          )}
          {booking.status === "cancelled" && (
            <Alert variant="danger" icon={<XCircle />} title="Booking cancelled">
              This booking has been cancelled.
              {booking.cancellationReason
                ? ` Reason: ${booking.cancellationReason}`
                : ""}
            </Alert>
          )}
          {booking.status === "expired" && (
            <Alert variant="warning" icon={<AlertCircle />} title="Booking expired">
              Payment was not received in time and this booking expired. You can
              book a new slot anytime.
            </Alert>
          )}
          {booking.status === "no_show" && (
            <Alert variant="warning" icon={<AlertCircle />} title="Marked as no-show">
              The venue marked this session as a no-show.
            </Alert>
          )}

          {/* Venue & court */}
          <section>
            <SectionLabel className="mb-2 flex items-center gap-1.5">
              <MapPin className="size-3.5" /> Venue &amp; court
            </SectionLabel>
            <div className="divide-y divide-[var(--color-border-default)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)]">
              <InfoRow
                icon={<MapPin className="size-3.5" />}
                label="Venue"
                value={venue.name}
              />
              <InfoRow
                icon={<CalendarDays className="size-3.5" />}
                label="Court"
                value={court.name}
              />
              {venue.city && (
                <InfoRow
                  icon={<MapPin className="size-3.5" />}
                  label="City"
                  value={venue.city}
                />
              )}
            </div>
            <div className="mt-2">
              <Link
                href={`/venues/${venue.slug}`}
                className="text-xs font-medium text-[var(--color-brand-600)] hover:underline"
              >
                View venue page →
              </Link>
            </div>
          </section>

          {/* Payment receipt */}
          {payment ? (
            <section>
              <SectionLabel className="mb-2 flex items-center gap-1.5">
                <CreditCard className="size-3.5" /> Payment receipt
              </SectionLabel>
              <PaymentReceiptCard payment={payment} receiptUrl={receiptUrl} />
            </section>
          ) : booking.status === "pending_payment" ? (
            <section>
              <SectionLabel className="mb-2 flex items-center gap-1.5">
                <CreditCard className="size-3.5" /> Payment
              </SectionLabel>
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 text-center">
                <p className="text-sm text-[var(--color-fg-muted)]">
                  No receipt uploaded yet.
                </p>
                <Link
                  href={`/book/${booking.id}/pay`}
                  className={`${buttonVariants({ size: "sm" })} mt-3`}
                >
                  Pay now
                </Link>
              </div>
            </section>
          ) : null}

          {/* Notes */}
          {booking.notes && (
            <section>
              <SectionLabel className="mb-2 block">Your notes</SectionLabel>
              <p className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 text-sm text-[var(--color-fg-muted)]">
                {booking.notes}
              </p>
            </section>
          )}

          {/* Review */}
          {isReviewable && !alreadyReviewed && (
            <section>
              <SectionLabel className="mb-2 block">Leave a review</SectionLabel>
              <LeaveReviewForm bookingId={booking.id} venueName={venue.name} />
            </section>
          )}
          {isReviewable && alreadyReviewed && (
            <p className="text-sm font-semibold text-[var(--color-success)]">
              ✓ You reviewed this session.
            </p>
          )}
        </div>

        {/* ── Right column — summary + actions ────────────────────────── */}
        <aside className="space-y-4">
          <div>
            <SectionLabel className="mb-2 block">Booking summary</SectionLabel>
            <dl className="divide-y divide-[var(--color-border-default)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] text-sm">
              <SummaryRow label="Date" value={formatDateManila(booking.startAt)} />
              <SummaryRow
                label="Time"
                value={`${formatTimeManila(booking.startAt)} – ${formatTimeManila(booking.endAt)}`}
              />
              <SummaryRow label="Duration" value={`${durationMin} min`} />
              <SummaryRow label="Court" value={court.name} />
              <div className="flex items-center justify-between border-t border-[var(--color-border-default)] px-4 py-2.5 text-sm font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums text-[var(--color-brand-700)]">
                  {formatPHP(booking.totalCentavos)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {booking.status === "pending_payment" && (
              <Link
                href={`/book/${booking.id}/pay`}
                className={`${buttonVariants()} w-full justify-center`}
              >
                Pay now
              </Link>
            )}
            {cancellable && (
              <CancelBookingButton bookingId={booking.id} />
            )}
          </div>

          {/* Booking metadata */}
          <div>
            <SectionLabel className="mb-2 block">Details</SectionLabel>
            <dl className="divide-y divide-[var(--color-border-default)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] text-sm">
              <SummaryRow label="Booking ID" value={booking.id.slice(0, 8).toUpperCase()} />
              <SummaryRow label="Booked" value={formatDateTimeManila(booking.createdAt)} />
              {booking.cancelledAt && (
                <SummaryRow label="Cancelled" value={formatDateTimeManila(booking.cancelledAt)} />
              )}
            </dl>
          </div>
        </aside>
      </div>
    </Container>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BookingStatusBadge({ status }: { status: string }) {
  const variant: "success" | "warning" | "info" | "danger" | "neutral" =
    status === "confirmed"
      ? "success"
      : status === "pending_payment" || status === "payment_submitted"
        ? "info"
        : status === "expired" || status === "no_show"
          ? "warning"
          : status === "cancelled"
            ? "danger"
            : "neutral";
  return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>;
}

function PaymentReceiptCard({
  payment,
  receiptUrl,
}: {
  payment: Payment;
  receiptUrl: string | null;
}) {
  return (
    <div className="divide-y divide-[var(--color-border-default)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)]">
      <div className="flex items-center justify-between px-4 py-2.5 text-sm">
        <span className="text-[var(--color-fg-muted)]">Status</span>
        <PaymentStatusBadge status={payment.status} />
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 text-sm">
        <span className="text-[var(--color-fg-muted)]">Amount</span>
        <span className="font-semibold tabular-nums">{formatPHP(payment.amountCentavos)}</span>
      </div>
      {payment.gcashReferenceNumber && (
        <div className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="text-[var(--color-fg-muted)]">GCash ref</span>
          <span className="font-mono text-xs">{payment.gcashReferenceNumber}</span>
        </div>
      )}
      {payment.submittedAt && (
        <div className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="text-[var(--color-fg-muted)]">Submitted</span>
          <span className="text-xs">{formatDateTimeManila(payment.submittedAt)}</span>
        </div>
      )}
      {payment.verifiedAt && (
        <div className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="text-[var(--color-fg-muted)]">Verified</span>
          <span className="text-xs">{formatDateTimeManila(payment.verifiedAt)}</span>
        </div>
      )}
      {payment.rejectionReason && (
        <div className="px-4 py-2.5 text-sm">
          <span className="text-[var(--color-fg-muted)]">Rejection reason: </span>
          <em>{payment.rejectionReason}</em>
        </div>
      )}
      {receiptUrl && (
        <div className="p-4">
          <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-default)] transition-opacity hover:opacity-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={receiptUrl}
              alt="GCash receipt"
              className="h-auto max-h-64 w-full bg-[var(--color-bg-subtle)] object-contain"
            />
            <div className="px-3 py-1.5 text-center text-[10px] text-[var(--color-fg-subtle)]">
              Tap to open full size
            </div>
          </a>
        </div>
      )}
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: Payment["status"] }) {
  switch (status) {
    case "verified":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <CheckCircle2 className="size-3" /> Verified
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
          <XCircle className="size-3" /> Rejected
        </span>
      );
    case "disputed":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600">
          <AlertCircle className="size-3" /> Disputed
        </span>
      );
    case "submitted":
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-fg-muted)]">
          <Clock className="size-3" /> Awaiting venue review
        </span>
      );
  }
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="flex items-center gap-1.5 text-[var(--color-fg-muted)]">
        {icon}
        {label}
      </span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-sm">
      <dt className="text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}
