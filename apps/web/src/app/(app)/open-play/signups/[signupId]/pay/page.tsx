import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Check, Clock } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/service";
import {
  findSessionWithVenue,
  findSignupById,
  findSignupPaymentBySignupId,
  listCourtsForSessions,
} from "@/features/open-play";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { OpenPlayReceiptForm } from "./receipt-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay for your Open Play spot" };

export default async function OpenPlayPayPage({
  params,
}: {
  params: Promise<{ signupId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent("/me/open-play")}`);

  const { signupId } = await params;
  const signup = await findSignupById(signupId);
  if (!signup) notFound();
  if (signup.playerId !== user.id) notFound();

  const detail = await findSessionWithVenue(signup.sessionId);
  if (!detail) notFound();

  const payment = await findSignupPaymentBySignupId(signup.id);
  const { session, venue, court } = detail;
  const courtsMap = await listCourtsForSessions([session.id]);
  const courts = courtsMap.get(session.id) ?? [{ id: court.id, name: court.name }];
  const courtNames = courts.map((c) => c.name).join(" · ");

  // RSC: runs once per request — not a render-loop hazard.
  const minutesLeft = Math.max(
    0,
    // eslint-disable-next-line react-hooks/purity
    Math.floor((signup.paymentDueAt.getTime() - Date.now()) / 60_000),
  );
  const wasRejected = signup.status === "pending_payment" && payment?.status === "rejected";

  return (
    <Container className="max-w-4xl py-3 sm:py-4">
      {signup.status === "payment_submitted" && <AutoRefresh intervalMs={8_000} />}
      <PageHeader
        back={{ href: "/me/open-play", label: "My Open Play" }}
        kicker="Pay"
        title="Complete your payment"
        subtitle={`Single GCash transfer to ${venue.name}, then upload the receipt.`}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {signup.status === "pending_payment" && (
            <>
              {wasRejected && payment && (
                <Alert variant="danger" title="Previous payment rejected">
                  {payment.rejectionReason ? (
                    <>
                      Reason: <em>{payment.rejectionReason}</em>. Please upload a corrected receipt below.
                    </>
                  ) : (
                    "Please upload a corrected receipt below."
                  )}
                </Alert>
              )}

              <OpenPlayReceiptForm
                signupId={signup.id}
                totalCentavos={signup.totalCentavos}
                gcashAccountName={venue.gcashAccountName}
                gcashAccountNumber={venue.gcashAccountNumber}
              />
            </>
          )}

          {signup.status === "payment_submitted" && payment && (
            <Alert variant="info" icon={<Clock />} title="Waiting for venue verification">
              Your receipt was uploaded {formatDateTimeManila(payment.submittedAt)}. The venue owner will confirm shortly. You&apos;ll see your spot move to <strong>Confirmed</strong> here once approved. This page updates automatically.
            </Alert>
          )}

          {signup.status === "confirmed" && (
            <Alert variant="success" icon={<Check />} title="You're in!">
              See you on the court — show up at {venue.name} a few minutes early.
            </Alert>
          )}

          {(signup.status === "expired" || signup.status === "cancelled") && (
            <Alert
              variant="warning"
              title={signup.status === "expired" ? "Payment window expired" : "Signup cancelled"}
            >
              {signup.status === "expired"
                ? "This signup expired before payment was completed. The spot has been released."
                : "Your signup was cancelled. The spot has been released."}{" "}
              <Link href="/open-play" className="font-medium underline">
                Browse other sessions
              </Link>
            </Alert>
          )}
        </div>

        <aside>
          <SectionLabel className="mb-2 block">Signup summary</SectionLabel>
          <dl className="divide-y divide-[var(--color-border-default)] text-sm">
            <div className="pb-2">
              <div className="font-semibold">{session.title}</div>
              <div className="text-[var(--color-fg-muted)]">{venue.name} · {courtNames}</div>
            </div>
            <SummaryRow label="Start" value={formatDateTimeManila(session.startAt)} />
            <SummaryRow label="End" value={formatDateTimeManila(session.endAt)} />
            <SummaryRow label="Court fee" value={formatPHP(signup.courtFeeCentavos)} />
            <SummaryRow
              label="Booking fee"
              value={
                signup.systemFeeCentavos === 0n
                  ? "₱0 (promo)"
                  : formatPHP(signup.systemFeeCentavos)
              }
              muted={signup.systemFeeCentavos === 0n}
            />
            <div className="flex items-center justify-between py-2 text-base">
              <dt className="font-semibold">Total</dt>
              <dd className="font-bold text-[var(--color-brand-700)]">
                {formatPHP(signup.totalCentavos)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-[var(--color-fg-muted)]">Status</dt>
              <dd>
                <StatusBadge status={signup.status} />
              </dd>
            </div>
            {signup.status === "pending_payment" && (
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

function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-[var(--color-fg-muted)]">{label}</dt>
      <dd className={muted ? "text-right font-medium text-[var(--color-fg-muted)]" : "text-right font-medium"}>
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: "success" | "warning" | "info" | "danger" | "neutral" =
    status === "confirmed"
      ? "success"
      : status === "pending_payment" || status === "payment_submitted"
        ? "info"
        : status === "expired"
          ? "warning"
          : status === "cancelled"
            ? "danger"
            : "neutral";
  return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>;
}
