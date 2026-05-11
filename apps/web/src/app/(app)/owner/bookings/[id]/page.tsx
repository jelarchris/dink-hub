import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  Phone,
  User,
  XCircle,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
import { formatPHP } from "@/lib/money";
import { formatDateTimeManila, formatDateManila, formatTimeManila } from "@/lib/date";
import { findBookingForOwner } from "@/features/bookings-view";
import { getReceiptSignedUrl } from "@/features/storage";
import { listActiveCourtsForVenue } from "@/features/owner-venues/service";
import type { Booking, Payment } from "@/db/schema";
import { NoShowForm } from "./_components/no-show-form";
import { CancelBookingForm } from "./_components/cancel-booking-form";
import { RescheduleForm } from "./_components/reschedule-form";
import { RecordRefundForm } from "./_components/record-refund-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `Booking · ${id.slice(0, 8)}` };
}

export default async function OwnerBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent(`/owner/bookings/${id}`)}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") redirect("/owner");

  const detail = await findBookingForOwner({ bookingId: id, ownerId: profile.id });
  if (!detail) notFound();

  const { booking, venue, court, player, payment } = detail;

  // Active courts for the same venue — passed to RescheduleForm for cross-court moves.
  const activeCourts = await listActiveCourtsForVenue(venue.id);

  const receiptUrl =
    payment?.receiptImagePath
      ? await getReceiptSignedUrl(payment.receiptImagePath, 300)
      : null;

  const isConfirmed = booking.status === "confirmed";
  const durationMin =
    (booking.endAt.getTime() - booking.startAt.getTime()) / 60_000;
  // Server-side request timestamp — RSC renders once per request so this is stable.
  const renderedAtMs = new Date().getTime();

  return (
    <Container className="max-w-3xl py-3 sm:py-4">
      <PageHeader
        back={{ href: "/owner", label: "Owner dashboard" }}
        kicker="Booking"
        title={`${court.name} · ${formatDateManila(booking.startAt)}`}
        subtitle={`${formatTimeManila(booking.startAt)} – ${formatTimeManila(booking.endAt)} · ${durationMin} min`}
        action={<BookingStatusBadge status={booking.status} />}
      />

      <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_280px]">
        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Status alerts */}
          {booking.status === "no_show" && (
            <Alert variant="warning" icon={<XCircle />} title="No-show recorded">
              This booking was marked as a no-show. The slot is no longer counted
              as occupied for reporting purposes.
            </Alert>
          )}
          {booking.status === "cancelled" && (
            <Alert variant="info" title="Booking cancelled">
              The player cancelled this booking.
            </Alert>
          )}
          {booking.status === "pending_payment" && (
            <Alert variant="warning" icon={<Clock />} title="Awaiting payment">
              The player has not yet uploaded a receipt. Payment is due by{" "}
              <strong>{formatDateTimeManila(booking.paymentDueAt)}</strong>.
            </Alert>
          )}
          {booking.status === "payment_submitted" && (
            <Alert variant="info" icon={<Clock />} title="Receipt uploaded — pending your review">
              Go to{" "}
              <Link href="/owner/payments" className="font-semibold underline">
                Verify payments
              </Link>{" "}
              to confirm or reject the receipt.
            </Alert>
          )}

          {/* Player info */}
          <section>
            <SectionLabel className="mb-2 flex items-center gap-1.5">
              <User className="size-3.5" /> Player
            </SectionLabel>
            <div className="divide-y divide-[var(--color-border-default)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)]">
              <InfoRow
                icon={<User className="size-3.5" />}
                label="Name"
                value={player.displayName}
              />
              <InfoRow
                icon={<CreditCard className="size-3.5" />}
                label="Email"
                value={player.email}
              />
              {player.phoneE164 && (
                <InfoRow
                  icon={<Phone className="size-3.5" />}
                  label="Phone"
                  value={formatPhoneDisplay(player.phoneE164)}
                />
              )}
            </div>
          </section>

          {/* Venue + court */}
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
                value={`${court.name} · ${court.isIndoor ? "Indoor" : "Outdoor"} · ${court.surface}`}
              />
            </div>
          </section>

          {/* Payment receipt */}
          {payment && (
            <section>
              <SectionLabel className="mb-2 flex items-center gap-1.5">
                <CreditCard className="size-3.5" /> Payment receipt
              </SectionLabel>
              <PaymentReceiptCard payment={payment} receiptUrl={receiptUrl} />
            </section>
          )}

          {/* No notes */}
          {booking.notes && (
            <section>
              <SectionLabel className="mb-2 block">Player notes</SectionLabel>
              <p className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 text-sm text-[var(--color-fg-muted)]">
                {booking.notes}
              </p>
            </section>
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
              <SummaryRow label="Court fee" value={formatPHP(booking.courtFeeCentavos)} />
              <SummaryRow label="System fee" value={formatPHP(booking.systemFeeCentavos)} />
              <div className="flex items-center justify-between px-4 py-2.5 text-base">
                <dt className="font-semibold">Total</dt>
                <dd className="font-bold text-[var(--color-brand-700)]">
                  {formatPHP(booking.totalCentavos)}
                </dd>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <dt className="text-[var(--color-fg-muted)]">Status</dt>
                <dd><BookingStatusBadge status={booking.status} /></dd>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 text-xs text-[var(--color-fg-subtle)]">
                <dt>Booked</dt>
                <dd>{formatDateTimeManila(booking.createdAt)}</dd>
              </div>
            </dl>
          </div>

          {/* Actions */}
          {(() => {
            const cancellableStatuses: Array<Booking["status"]> = [
              "pending_payment",
              "payment_submitted",
              "confirmed",
            ];
            const reschedulableStatuses: Array<Booking["status"]> = [
              "payment_submitted",
              "confirmed",
            ];
            const canCancel = cancellableStatuses.includes(booking.status);
            const canReschedule =
              reschedulableStatuses.includes(booking.status) &&
              booking.startAt.getTime() > renderedAtMs;

            if (!isConfirmed && !canCancel && !canReschedule) return null;

            return (
              <div>
                <SectionLabel className="mb-2 block">Actions</SectionLabel>
                <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4">
                  {canReschedule && (
                    <div>
                      <p className="mb-2 text-xs text-[var(--color-fg-muted)]">
                        Move this booking to a different time{activeCourts.length > 1 ? " or court" : ""} at the same venue.
                      </p>
                      <RescheduleForm
                        bookingId={booking.id}
                        version={booking.version}
                        currentStartAt={booking.startAt}
                        currentDurationMin={durationMin}
                        currentCourtId={booking.courtId}
                        availableCourts={activeCourts.map((c) => ({
                          id: c.id,
                          name: c.name,
                          isIndoor: c.isIndoor,
                          surface: c.surface,
                          hourlyRateCentavos: Number(c.hourlyRateCentavos),
                        }))}
                      />
                    </div>
                  )}
                  {canCancel && (
                    <div>
                      <p className="mb-2 text-xs text-[var(--color-fg-muted)]">
                        Cancel this booking. The player will be emailed the
                        reason. Paid bookings require a manual GCash refund.
                      </p>
                      <CancelBookingForm
                        bookingId={booking.id}
                        version={booking.version}
                        isConfirmed={isConfirmed}
                      />
                    </div>
                  )}
                  {isConfirmed && (
                    <div>
                      <p className="mb-2 text-xs text-[var(--color-fg-muted)]">
                        Use this if the player booked but did not show up. This
                        action is permanent and recorded in the audit log.
                      </p>
                      <NoShowForm bookingId={booking.id} version={booking.version} />
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Refund recording — shown when booking is refunded but payment is not yet reversed */}
          {booking.status === "refunded" &&
            payment?.status === "verified" && (
              <div>
                <SectionLabel className="mb-2 block">Refund</SectionLabel>
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4">
                  <p className="mb-3 text-xs text-[var(--color-fg-muted)]">
                    Confirm that you have returned the player&apos;s payment via
                    GCash. DinkHub will adjust your next weekly invoice accordingly.
                  </p>
                  <RecordRefundForm
                    bookingId={booking.id}
                    paymentId={payment.id}
                    paymentVersion={payment.version}
                    formattedTotal={formatPHP(booking.totalCentavos)}
                  />
                </div>
              </div>
            )}
        </aside>
      </div>
    </Container>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function BookingStatusBadge({ status }: { status: Booking["status"] }) {
  switch (status) {
    case "confirmed":
      return <Badge variant="success">Confirmed</Badge>;
    case "pending_payment":
      return <Badge variant="warning">Pending payment</Badge>;
    case "payment_submitted":
      return <Badge variant="info">Receipt submitted</Badge>;
    case "cancelled":
      return <Badge variant="neutral">Cancelled</Badge>;
    case "no_show":
      return <Badge variant="danger">No-show</Badge>;
    case "expired":
      return <Badge variant="neutral">Expired</Badge>;
    case "refunded":
      return <Badge variant="neutral">Refunded</Badge>;
  }
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
        <span className="text-[var(--color-fg-muted)]">Amount paid</span>
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
            className="block overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-default)] hover:opacity-90 transition-opacity"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={receiptUrl}
              alt="Payment receipt"
              className="h-auto max-h-64 w-full object-contain bg-[var(--color-bg-subtle)]"
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
          <Clock className="size-3" /> Awaiting review
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

/** Format E.164 phone (+63XXXXXXXXXX) as a human-readable local number. */
function formatPhoneDisplay(e164: string): string {
  if (e164.startsWith("+63") && e164.length === 13) {
    return `0${e164.slice(3, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}`;
  }
  return e164;
}
