import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Check, Clock, CreditCard } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/service";
import {
  findSessionWithVenue,
  findSignupById,
  findSignupPaymentBySignupId,
} from "@/features/open-play";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { venueMediaPublicUrl } from "@/lib/venue-media";
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

              <section>
                <SectionLabel className="mb-2 inline-flex items-center gap-1.5">
                  <CreditCard className="size-3.5" /> Send via GCash
                </SectionLabel>
                <PaymentInstructions
                  venueName={venue.name}
                  gcashAccountName={venue.gcashAccountName}
                  gcashAccountNumber={venue.gcashAccountNumber}
                  gcashQrImageUrl={venueMediaPublicUrl(venue.gcashQrImagePath)}
                  totalCentavos={signup.totalCentavos}
                  signupId={signup.id}
                />
              </section>

              <section>
                <SectionLabel className="mb-2 block">Upload your receipt</SectionLabel>
                <OpenPlayReceiptForm signupId={signup.id} />
              </section>
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
              <div className="text-[var(--color-fg-muted)]">{venue.name} · {court.name}</div>
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

function PaymentInstructions({
  venueName,
  gcashAccountName,
  gcashAccountNumber,
  gcashQrImageUrl,
  totalCentavos,
  signupId,
}: {
  venueName: string;
  gcashAccountName: string | null;
  gcashAccountNumber: string | null;
  gcashQrImageUrl: string | null;
  totalCentavos: bigint;
  signupId: string;
}) {
  const totalLabel = formatPHP(totalCentavos);
  const shortRef = signupId.slice(0, 8);
  return (
    <ol className="space-y-3 text-sm">
      <Step n={1}>
        <div className="space-y-2">
          <div>
            Open GCash and send{" "}
            <span className="font-bold text-[var(--color-brand-700)]">{totalLabel}</span> to:
          </div>
          {gcashQrImageUrl && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-3">
              <div className="mx-auto max-w-[240px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gcashQrImageUrl}
                  alt={`GCash QR code for ${venueName}`}
                  className="h-auto w-full rounded-[var(--radius-sm)] bg-white object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <p className="mt-2 text-center text-[11px] text-[var(--color-fg-muted)]">
                Scan with GCash → Pay QR
              </p>
            </div>
          )}
          {gcashAccountNumber ? (
            <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                    GCash number
                  </div>
                  <div className="truncate font-mono text-base font-semibold tabular-nums">
                    {gcashAccountNumber}
                  </div>
                  {gcashAccountName && (
                    <div className="mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">
                      {gcashAccountName}
                    </div>
                  )}
                </div>
                <CopyButton value={gcashAccountNumber} label="GCash number" size="sm" />
              </div>
            </div>
          ) : !gcashQrImageUrl ? (
            <div className="text-[var(--color-fg-muted)]">
              {venueName} (account info unavailable — contact the venue)
            </div>
          ) : null}
        </div>
      </Step>
      <Step n={2}>
        Enter exactly{" "}
        <span className="font-bold text-[var(--color-brand-700)]">{totalLabel}</span> as the amount. In the GCash receipt screenshot, make sure the <strong>amount</strong> and <strong>reference number</strong> are visible.
      </Step>
      <Step n={3}>
        <div className="space-y-2">
          <div>
            Add this <strong>signup ID</strong> in the GCash message field so the venue can match your payment quickly:
          </div>
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] px-3 py-2">
            <code className="truncate font-mono text-sm font-semibold">{shortRef}</code>
            <CopyButton value={shortRef} label="signup ID" size="sm" />
          </div>
          <div className="text-xs text-[var(--color-fg-muted)]">
            Then upload your receipt below.
          </div>
        </div>
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
        : status === "expired"
          ? "warning"
          : status === "cancelled"
            ? "danger"
            : "neutral";
  return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>;
}
