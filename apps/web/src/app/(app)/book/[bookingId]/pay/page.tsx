import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Check, Clock, CreditCard } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  // After rejection the booking status flips back to pending_payment but the
  // payment row carries `status: "rejected"` + the rejection reason. Detect
  // that combination to show the "rejected — try again" banner above the upload form.
  const wasRejected = booking.status === "pending_payment" && payment?.status === "rejected";

  return (
    <Container className="max-w-3xl py-8">
      <Link
        href="/me/bookings"
        className="mb-4 inline-block text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        ← My bookings
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Complete your payment</h1>
      <p className="mt-1 text-[var(--color-fg-muted)]">
        Send a single GCash transfer to <span className="font-medium">{venue.name}</span>, then
        upload the receipt.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {booking.status === "pending_payment" && (
            <>
              {wasRejected && payment && (
                <Alert variant="danger" title="Previous payment rejected">
                  {payment.rejectionReason
                    ? <>Reason: <em>{payment.rejectionReason}</em>. Please upload a corrected receipt below.</>
                    : "Please upload a corrected receipt below."}
                </Alert>
              )}
              <PaymentInstructions
                venueName={venue.name}
                gcashAccountName={venue.gcashAccountName}
                gcashAccountNumber={venue.gcashAccountNumber}
                totalCentavos={booking.totalCentavos}
                bookingId={booking.id}
              />
              <Card>
                <CardHeader>
                  <CardTitle>Upload your receipt</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReceiptUploadForm bookingId={booking.id} />
                </CardContent>
              </Card>
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

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Booking summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="font-medium">{venue.name}</div>
                <div className="text-[var(--color-fg-muted)]">{court.name}</div>
              </div>
              <div className="border-t border-[var(--color-border-default)] pt-3">
                <div className="text-[var(--color-fg-muted)]">Start</div>
                <div className="font-medium">{formatDateTimeManila(booking.startAt)}</div>
              </div>
              <div>
                <div className="text-[var(--color-fg-muted)]">End</div>
                <div className="font-medium">{formatDateTimeManila(booking.endAt)}</div>
              </div>
              <div className="border-t border-[var(--color-border-default)] pt-3 space-y-1">
                <Row label="Court fee" value={formatPHP(booking.courtFeeCentavos)} />
                <Row label="System fee" value={formatPHP(booking.systemFeeCentavos)} />
                <Row label="Total" value={formatPHP(booking.totalCentavos)} bold />
              </div>
              <div className="flex items-center justify-between border-t border-[var(--color-border-default)] pt-3">
                <span className="text-[var(--color-fg-muted)]">Status</span>
                <StatusBadge status={booking.status} />
              </div>
              {booking.status === "pending_payment" && (
                <div className="text-xs text-[var(--color-fg-muted)]">
                  Payment due in <strong className="text-[var(--color-fg)]">{minutesLeft} min</strong>.
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </Container>
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-5" /> Send via GCash
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
              <span className="text-[var(--color-fg-muted)]">{venueName} (account info unavailable — contact the venue)</span>
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
      </CardContent>
    </Card>
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

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={"flex items-center justify-between" + (bold ? " text-base" : "")}>
      <span className={bold ? "font-semibold" : "text-[var(--color-fg-muted)]"}>{label}</span>
      <span className={bold ? "font-bold" : ""}>{value}</span>
    </div>
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
