import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileCheck,
  MapPin,
  Trophy,
  Upload,
  XCircle,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/page-header";
import { AutoRefresh } from "@/components/auto-refresh";
import { cn } from "@/lib/cn";
import { formatPHP } from "@/lib/money";
import { formatDateManila, formatDateTimeManila, formatTimeManila } from "@/lib/date";
import {
  googleMapsAddressSearchUrl,
  googleMapsDirectionsUrl,
  normalizeCoordinatePair,
} from "@/lib/maps";
import { venueMediaPublicUrl } from "@/lib/venue-media";
import { findBookingDetailForPlayer } from "@/features/bookings-view";
import { findReviewForBooking } from "@/features/reviews/service";
import { getReceiptSignedUrl } from "@/features/storage";
import type { Payment } from "@/db/schema";
import { CancelBookingButton } from "../cancel-button";
import { LeaveReviewForm } from "../_components/leave-review-form";
import { BookingActionButtons } from "../_components/booking-action-buttons";

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

  // Owner phone for the "Contact Venue" button — cheap PK lookup.
  const [ownerRow] = await db
    .select({ phoneE164: profiles.phoneE164 })
    .from(profiles)
    .where(eq(profiles.id, venue.ownerId))
    .limit(1);
  const contactPhone = ownerRow?.phoneE164 ?? null;

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
  const durationLabel =
    durationMin >= 60 && durationMin % 60 === 0
      ? `${durationMin / 60}hr`
      : `${durationMin} min`;

  // Hero image — prefer stored path, fall back to legacy URL, then a brand gradient.
  const coverImageUrl =
    venueMediaPublicUrl(venue.coverImagePath) ?? venue.coverImageUrl ?? null;

  // Directions: prefer coordinates, fall back to address search.
  const coords = normalizeCoordinatePair({
    latitude: venue.latitude,
    longitude: venue.longitude,
  });
  const fullAddress = [venue.addressLine, venue.city, venue.province]
    .filter(Boolean)
    .join(", ");
  const directionsUrl = coords
    ? googleMapsDirectionsUrl(coords)
    : fullAddress
      ? googleMapsAddressSearchUrl(fullAddress)
      : null;

  return (
    <Container className="max-w-3xl py-3 sm:py-4">
      {booking.status === "payment_submitted" && <AutoRefresh intervalMs={10_000} />}

      {/* Back link */}
      <div className="mb-3">
        <Link
          href="/me/bookings"
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          ← My bookings
        </Link>
      </div>

      {/* ── Hero card ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
        <div className="relative aspect-[16/9] w-full bg-gradient-to-br from-[var(--color-brand-400)] to-[var(--color-brand-700)] sm:aspect-[21/9]">
          {coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImageUrl}
              alt={venue.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/40">
              <Trophy className="size-16" aria-hidden />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />

          <div className="absolute right-3 top-3">
            <HeroStatusBadge status={booking.status} />
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3 sm:p-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[var(--color-brand-600)] text-base font-extrabold uppercase text-white shadow-md sm:size-14">
              {venue.name.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold text-white sm:text-lg">
                {venue.name}
              </h1>
              {fullAddress && (
                <p className="flex items-center gap-1 text-xs text-white/85">
                  <MapPin className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{fullAddress}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Step progress bar ─────────────────────────────────────── */}
      <section className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4">
        <StepProgress status={booking.status} endAtMs={booking.endAt.getTime()} now={now} />
      </section>

      {/* ── Status alerts ─────────────────────────────────────────── */}
      <div className="mt-4 space-y-3">
        {booking.status === "pending_payment" && (
          <Alert variant="warning" icon={<Clock />} title="Payment needed">
            Pay before <strong>{formatDateTimeManila(booking.paymentDueAt)}</strong>{" "}
            to hold your slot. The booking will expire after that.
          </Alert>
        )}
        {booking.status === "payment_submitted" && (
          <Alert variant="info" icon={<Clock />} title="Receipt uploaded — pending venue review">
            Your receipt has been sent to the venue. Confirmation usually arrives
            within minutes.
          </Alert>
        )}
        {booking.status === "confirmed" && booking.startAt.getTime() > now && (
          <Alert variant="success" icon={<CheckCircle2 />} title="You're all set!">
            Show this page at the venue front desk. Arrive 10 minutes early to
            warm up.
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
      </div>

      {/* ── Booking summary ───────────────────────────────────────── */}
      <section className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4">
        <h2 className="mb-3 text-base font-bold">Booking Summary</h2>

        <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
            <CalendarDays className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">
              Date
            </p>
            <p className="text-sm font-semibold">{formatDateManila(booking.startAt)}</p>
          </div>
        </div>

        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">
          Court Schedule
        </p>
        <div className="mt-1.5 flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
            <Clock className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-semibold">{court.name}</p>
              <Badge variant={court.isIndoor ? "info" : "success"}>
                {court.isIndoor ? "Indoor" : "Outdoor"}
              </Badge>
            </div>
            <p className="text-xs text-[var(--color-fg-muted)]">
              {formatTimeManila(booking.startAt)} – {formatTimeManila(booking.endAt)}{" "}
              ({durationLabel})
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 border-t border-[var(--color-border-default)] pt-3 text-sm">
          <div className="flex items-center justify-between text-xs text-[var(--color-fg-muted)]">
            <span>Court fee</span>
            <span className="tabular-nums">{formatPHP(booking.courtFeeCentavos)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--color-fg-muted)]">
            <span>System fee</span>
            <span className="tabular-nums">{formatPHP(booking.systemFeeCentavos)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--color-border-default)] pt-2 text-sm font-bold">
            <span>Total Paid</span>
            <span className="tabular-nums text-[var(--color-brand-700)]">
              {formatPHP(booking.totalCentavos)}
            </span>
          </div>
        </div>
      </section>

      {/* ── Action buttons ────────────────────────────────────────── */}
      {booking.status !== "cancelled" && booking.status !== "expired" && (
        <section className="mt-4">
          <BookingActionButtons
            bookingTitle={`Pickleball · ${venue.name}`}
            bookingDescription={`${court.name} at ${venue.name}. Booking ID ${booking.id.slice(0, 8).toUpperCase()}.`}
            bookingLocation={fullAddress || venue.name}
            startAtIso={booking.startAt.toISOString()}
            endAtIso={booking.endAt.toISOString()}
            directionsUrl={directionsUrl}
            contactPhone={contactPhone}
            receiptUrl={receiptUrl}
          />
        </section>
      )}

      {/* ── Payment receipt details ───────────────────────────────── */}
      {payment ? (
        <section className="mt-4">
          <SectionLabel className="mb-2 flex items-center gap-1.5">
            <CreditCard className="size-3.5" /> Payment receipt
          </SectionLabel>
          <PaymentReceiptCard payment={payment} receiptUrl={receiptUrl} />
        </section>
      ) : booking.status === "pending_payment" ? (
        <section className="mt-4">
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
        <section className="mt-4">
          <SectionLabel className="mb-2 block">Your notes</SectionLabel>
          <p className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 text-sm text-[var(--color-fg-muted)]">
            {booking.notes}
          </p>
        </section>
      )}

      {/* Review */}
      {isReviewable && !alreadyReviewed && (
        <section className="mt-4">
          <SectionLabel className="mb-2 block">Leave a review</SectionLabel>
          <LeaveReviewForm bookingId={booking.id} venueName={venue.name} />
        </section>
      )}
      {isReviewable && alreadyReviewed && (
        <p className="mt-4 text-sm font-semibold text-[var(--color-success)]">
          ✓ You reviewed this session.
        </p>
      )}

      {/* Booking metadata */}
      <section className="mt-4">
        <SectionLabel className="mb-2 block">Details</SectionLabel>
        <dl className="divide-y divide-[var(--color-border-default)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] text-sm">
          <SummaryRow
            label="Booking ID"
            value={`#${booking.id.slice(0, 8).toUpperCase()}`}
          />
          <SummaryRow label="Booked" value={formatDateTimeManila(booking.createdAt)} />
          {booking.cancelledAt && (
            <SummaryRow
              label="Cancelled"
              value={formatDateTimeManila(booking.cancelledAt)}
            />
          )}
        </dl>
        <div className="mt-2">
          <Link
            href={`/venues/${venue.slug}`}
            className="text-xs font-medium text-[var(--color-brand-600)] hover:underline"
          >
            View venue page →
          </Link>
        </div>
      </section>

      {/* Bottom-of-page primary actions */}
      {(booking.status === "pending_payment" || cancellable) && (
        <div className="mt-5 space-y-2">
          {booking.status === "pending_payment" && (
            <Link
              href={`/book/${booking.id}/pay`}
              className={`${buttonVariants()} w-full justify-center`}
            >
              Pay now
            </Link>
          )}
          {cancellable && <CancelBookingButton bookingId={booking.id} />}
        </div>
      )}
    </Container>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type BookingStatus =
  | "pending_payment"
  | "payment_submitted"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "expired"
  | "no_show"
  | "refunded";

function HeroStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending_payment: { label: "Pending Payment", cls: "bg-amber-500 text-white" },
    payment_submitted: { label: "Under Review", cls: "bg-blue-500 text-white" },
    confirmed: { label: "Confirmed", cls: "bg-blue-600 text-white" },
    completed: { label: "Completed", cls: "bg-emerald-600 text-white" },
    cancelled: { label: "Cancelled", cls: "bg-rose-500 text-white" },
    expired: { label: "Expired", cls: "bg-stone-500 text-white" },
    no_show: { label: "No Show", cls: "bg-orange-500 text-white" },
    refunded: { label: "Refunded", cls: "bg-stone-500 text-white" },
  };
  const meta = map[status] ?? { label: status, cls: "bg-stone-500 text-white" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide shadow-md",
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

/**
 * 4-step indicator. A step is "done" once its threshold is reached, "active"
 * when it represents the current state, and "pending" otherwise.
 */
function StepProgress({
  status,
  endAtMs,
  now,
}: {
  status: string;
  endAtMs: number;
  now: number;
}) {
  type State = "done" | "active" | "pending";
  const s = status as BookingStatus;

  // A booking always counts as "Submitted" once it exists.
  const submittedState: State = "done";

  const underReviewState: State =
    s === "pending_payment"
      ? "pending"
      : s === "payment_submitted"
        ? "active"
        : "done";

  const confirmedState: State =
    s === "pending_payment" || s === "payment_submitted"
      ? "pending"
      : s === "confirmed" && endAtMs > now
        ? "active"
        : s === "confirmed" ||
            s === "completed" ||
            s === "no_show" ||
            s === "refunded"
          ? "done"
          : "pending";

  const completedState: State =
    (s === "confirmed" || s === "completed") && endAtMs <= now ? "done" : "pending";

  const isStopped = s === "cancelled" || s === "expired";
  const steps: Array<{ label: string; icon: React.ReactNode; state: State }> = [
    {
      label: "Submitted",
      icon: <Upload className="size-4" aria-hidden />,
      state: submittedState,
    },
    {
      label: "Under Review",
      icon: <ClipboardCheck className="size-4" aria-hidden />,
      state: isStopped ? "pending" : underReviewState,
    },
    {
      label: "Confirmed",
      icon: <FileCheck className="size-4" aria-hidden />,
      state: isStopped ? "pending" : confirmedState,
    },
    {
      label: "Completed",
      icon: <Trophy className="size-4" aria-hidden />,
      state: isStopped ? "pending" : completedState,
    },
  ];

  return (
    <ol className="flex items-start justify-between">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const nextDone = !isLast && steps[i + 1]!.state !== "pending";
        return (
          <li key={step.label} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <div className="flex-1" />
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  step.state === "done" &&
                    "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white",
                  step.state === "active" &&
                    "border-[var(--color-brand-600)] bg-[var(--color-brand-50)] text-[var(--color-brand-700)]",
                  step.state === "pending" &&
                    "border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] text-[var(--color-fg-subtle)]",
                )}
              >
                {step.state === "done" ? (
                  <CheckCircle2 className="size-4" aria-hidden />
                ) : (
                  step.icon
                )}
              </div>
              <div className="flex-1">
                {!isLast && (
                  <div
                    className={cn(
                      "h-0.5 w-full",
                      nextDone
                        ? "bg-[var(--color-brand-600)]"
                        : "bg-[var(--color-border-default)]",
                    )}
                  />
                )}
              </div>
            </div>
            <span
              className={cn(
                "text-center text-[10px] font-semibold leading-tight",
                step.state === "pending"
                  ? "text-[var(--color-fg-subtle)]"
                  : "text-[var(--color-fg)]",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-sm">
      <dt className="text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}
