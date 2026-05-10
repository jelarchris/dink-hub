import { notFound, redirect } from "next/navigation";
import { Check, Clock, CreditCard } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
import { findBookingDetailForPlayer } from "@/features/bookings-view";
import { getCurrentUser } from "@/features/auth/service";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { ReceiptUploadForm } from "./receipt-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay for your booking" };

export default async function PayPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent("/me/bookings")}`);

  const { bookingId } = await params;
  const detail = await findBookingDetailForPlayer({ bookingId, playerId: user.id });
  if (!detail) notFound();

  const { booking, venue, court, payment } = detail;
  // RSC: runs once per request — not a render-loop hazard.
  // eslint-disable-next-line react-hooks/purity
  const minutesLeft = Math.max(0, Math.floor((booking.paymentDueAt.getTime() - Date.now()) / 60_000));
  const wasRejected = booking.status === "pending_payment" && payment?.status === "rejected";

  return (
    <Container className="max-w-4xl py-3 sm:py-4">
      <PageHeader
        back={{ href: "/me/bookings", label: "My bookings" }}
        kicker="Pay"
        title="Complete your payment"
        subtitle={`Single GCash transfer to ${venue.name}, then upload the receipt.`}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {booking.status === "pending_payment" && (
            <>
              {wasRejected && payment && (
                <Alert variant="danger" title="Previous payment rejected">
                  {payment.rejectionReason
                    ? <>Reason: <em>{payment.rejectionReason}</em>. Please upload a corrected receipt below.</>
                    : "Please upload a corrected receipt below."}
                </Alert>
              )}

              <section>
                <SectionLabel className="mb-2 inline-flex items-center gap-1.5">
                  <CreditCard className="size-3.5" /> Send via GCash
                </SectionLabel>
                <PaymentInstructions
                  venueName={venue.name}
                  gcashAccountName={venue.gcashAccountName}
                  gcashAccountNumber={venue.gcashAccountNumber}
                  totalCentavos={booking.totalCentavos}
                  bookingId={booking.id}
                />
              </section>

              <section>
                <SectionLabel className="mb-2 block">Upload your receipt</SectionLabel>
                <ReceiptUploadForm bookingId={booking.id} />
              </section>
            </>
          )}

          {booking.status === "payment_submitted" && payment && (
            <Alert variant="info" icon={<Clock />} title="Waiting for venue verification">
              Your receipt was uploaded {formatDateTimeManila(payment.submittedAt)}. The venue
              owner will confirm your payment shortly. You&apos;ll see your booking move to{" "}
              <strong>Confirmed</strong> here once approved.
            </Alert>
          )}

          {booking.status === "confirmed" && (
            <Alert variant="success" icon={<Check />} title="Booking confirmed">
              You&apos;re all set! Show up at {venue.name} a few minutes early. See you on the court.
            </Alert>
          )}

          {(booking.status === "expired" || booking.status === "cancelled") && (
            <Alert variant="warning" title={booking.status === "expired" ? "Payment window expired" : "Booking cancelled"}>
              {booking.status === "expired"
                ? "This booking expired before payment was completed. The slot has been released — please pick a new time."
                : "This booking was cancelled. The slot has been released."}
            </Alert>
          )}
        </div>

        <aside>
          <SectionLabel className="mb-2 block">Booking summary</SectionLabel>
          <dl className="divide-y divide-[var(--color-border-default)] text-sm">
            <div className="pb-2">
              <div className="font-semibold">{venue.name}</div>
              <div className="text-[var(--color-fg-muted)]">{court.name}</div>
            </div>
            <SummaryRow label="Start" value={formatDateTimeManila(booking.startAt)} />
            <SummaryRow label="End" value={formatDateTimeManila(booking.endAt)} />
            <SummaryRow label="Court fee" value={formatPHP(booking.courtFeeCentavos)} />
            <SummaryRow label="System fee" value={formatPHP(booking.systemFeeCentavos)} />
            <div className="flex items-center justify-between py-2 text-base">
              <dt className="font-semibold">Total</dt>
              <dd className="font-bold text-[var(--color-brand-700)]">{formatPHP(booking.totalCentavos)}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-[var(--color-fg-muted)]">Status</dt>
              <dd><StatusBadge status={booking.status} /></dd>
            </div>
            {booking.status === "pending_payment" && (
              <div className="pt-2 text-xs text-[var(--color-fg-muted)]">
                Payment due in <strong className="text-[var(--color-fg)]">{minutesLeft} min</strong>.
              </div>
            )}
          </dl>
        </aside>
      </div>
    </Container>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}

function PaymentInstructions({
  venueName,
  gcashAccountName,
  gcashAccountNumber,
  totalCentavos,
  bookingId,
}: {
  venueName: string;
  gcashAccountName: string | null;
  gcashAccountNumber: string | null;
  totalCentavos: bigint;
  bookingId: string;
}) {
  return (
    <ol className="space-y-3 text-sm">
      <Step n={1}>
        Open GCash and send{" "}
        <span className="font-bold text-[var(--color-brand-700)]">{formatPHP(totalCentavos)}</span>
        {" "}to:
        {gcashAccountNumber ? (
          <div className="mt-2 rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] px-3 py-2">
            <div className="text-xs text-[var(--color-fg-muted)]">Account</div>
            <div className="font-mono text-base font-semibold">{gcashAccountNumber}</div>
            {gcashAccountName && (
              <div className="mt-1 text-xs text-[var(--color-fg-muted)]">{gcashAccountName}</div>
            )}
          </div>
        ) : (
          <span className="text-[var(--color-fg-muted)]"> {venueName} (account info unavailable — contact the venue)</span>
        )}
      </Step>
      <Step n={2}>
        In the GCash receipt screenshot, make sure the <strong>amount</strong> and{" "}
        <strong>reference number</strong> are visible.
      </Step>
      <Step n={3}>
        Upload your receipt below. Booking ID:{" "}
        <code className="rounded bg-[var(--color-bg-muted)] px-1.5 py-0.5 text-xs">
          {bookingId.slice(0, 8)}
        </code>
      </Step>
    </ol>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-500)] text-xs font-semibold text-white">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
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
