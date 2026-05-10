import { notFound, redirect } from "next/navigation";
import { Check, Clock, CreditCard, XCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
import { findInvoiceForOwner } from "@/features/owner-invoices";
import { getSystemSettings } from "@/features/system-settings";
import { getSessionUser } from "@/server/session";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { venueMediaPublicUrl } from "@/lib/venue-media";
import type { OwnerInvoice } from "@/db/schema";
import { InvoiceReceiptForm } from "./pay-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay DinkHub invoice" };

const PERIOD_FMT = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});
const DUE_FMT = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "Asia/Manila",
});

function formatPeriod(start: Date, end: Date): string {
  const inclusiveEnd = new Date(end.getTime() - 86_400_000);
  return `${PERIOD_FMT.format(start)} – ${PERIOD_FMT.format(inclusiveEnd)}`;
}

function formatDueDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(`${value}T00:00:00+08:00`) : value;
  return DUE_FMT.format(d);
}

export default async function PayInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getSessionUser();
  const { id } = await params;
  if (!profile) {
    redirect(`/sign-in?next=${encodeURIComponent(`/owner/invoices/${id}`)}`);
  }
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-4">
        <Alert variant="warning" title="Owner access required">
          Your account isn&apos;t set up as a venue owner.
        </Alert>
      </Container>
    );
  }

  const detail = await findInvoiceForOwner(id, profile.id);
  if (!detail) notFound();

  const { invoice, venue } = detail;
  const settings = await getSystemSettings();
  const isPayable = invoice.status === "open" || invoice.status === "rejected";

  return (
    <Container className="max-w-4xl py-3 sm:py-4">
      <PageHeader
        back={{ href: "/owner/invoices", label: "DinkHub invoices" }}
        kicker="Pay invoice"
        title="Settle your weekly invoice"
        subtitle={`Send to DinkHub via GCash, then upload the receipt.`}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {invoice.status === "rejected" && (
            <Alert variant="danger" icon={<XCircle />} title="Previous receipt rejected">
              {invoice.rejectionReason
                ? <>Reason: <em>{invoice.rejectionReason}</em>. Please upload a corrected receipt below.</>
                : "Please upload a corrected receipt below."}
            </Alert>
          )}

          {invoice.status === "submitted" && (
            <Alert variant="info" icon={<Clock />} title="Waiting for DinkHub to verify">
              Receipt uploaded
              {invoice.submittedAt ? ` ${formatDateTimeManila(invoice.submittedAt)}` : ""}.
              We&apos;ll email you when it&apos;s verified — usually within 1 business day.
            </Alert>
          )}

          {invoice.status === "verified" && (
            <Alert variant="success" icon={<Check />} title="Invoice paid">
              Verified
              {invoice.verifiedAt ? ` ${formatDateTimeManila(invoice.verifiedAt)}` : ""}.
              Thank you!
            </Alert>
          )}

          {invoice.status === "void" && (
            <Alert variant="warning" title="Invoice voided">
              This invoice has been voided by DinkHub. Nothing is owed.
            </Alert>
          )}

          {isPayable && (
            <>
              <section>
                <SectionLabel className="mb-2 inline-flex items-center gap-1.5">
                  <CreditCard className="size-3.5" /> Send via GCash
                </SectionLabel>
                <PaymentInstructions
                  gcashAccountName={settings.dinkhubGcashAccountName}
                  gcashAccountNumber={settings.dinkhubGcashAccountNumber}
                  gcashQrImageUrl={venueMediaPublicUrl(settings.dinkhubGcashQrImagePath)}
                  totalCentavos={invoice.totalCentavos}
                  invoiceId={invoice.id}
                />
              </section>

              <section>
                <SectionLabel className="mb-2 block">Upload your receipt</SectionLabel>
                <InvoiceReceiptForm invoiceId={invoice.id} />
              </section>
            </>
          )}
        </div>

        <aside>
          <SectionLabel className="mb-2 block">Invoice summary</SectionLabel>
          <dl className="divide-y divide-[var(--color-border-default)] text-sm">
            <div className="pb-2">
              <div className="font-semibold">{venue.name}</div>
              <div className="text-[var(--color-fg-muted)]">
                {formatPeriod(invoice.periodStart, invoice.periodEnd)}
              </div>
            </div>
            <SummaryRow
              label="Bookings"
              value={`${invoice.bookingCount}`}
            />
            <SummaryRow
              label="Booking fees"
              value={formatPHP(invoice.feesCentavos)}
            />
            {invoice.carryoverCentavos > 0n && (
              <SummaryRow
                label="Carryover"
                value={formatPHP(invoice.carryoverCentavos)}
              />
            )}
            <div className="flex items-center justify-between py-2 text-base">
              <dt className="font-semibold">Total due</dt>
              <dd className="font-bold text-[var(--color-brand-700)]">
                {formatPHP(invoice.totalCentavos)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-[var(--color-fg-muted)]">Status</dt>
              <dd>
                <StatusBadge status={invoice.status} />
              </dd>
            </div>
            {isPayable && (
              <div className="pt-2 text-xs text-[var(--color-fg-muted)]">
                Due <strong className="text-[var(--color-fg)]">{formatDueDate(invoice.dueDate)}</strong>.
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
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: OwnerInvoice["status"] }) {
  switch (status) {
    case "open":
      return <Badge variant="warning">Open</Badge>;
    case "submitted":
      return <Badge variant="info">Awaiting verification</Badge>;
    case "verified":
      return <Badge variant="success">Paid</Badge>;
    case "rejected":
      return <Badge variant="danger">Rejected</Badge>;
    case "void":
      return <Badge variant="neutral">Void</Badge>;
  }
}

function PaymentInstructions({
  gcashAccountName,
  gcashAccountNumber,
  gcashQrImageUrl,
  totalCentavos,
  invoiceId,
}: {
  gcashAccountName: string | null;
  gcashAccountNumber: string | null;
  gcashQrImageUrl: string | null;
  totalCentavos: bigint;
  invoiceId: string;
}) {
  const totalLabel = formatPHP(totalCentavos);
  const shortRef = invoiceId.slice(0, 8);
  return (
    <ol className="space-y-3 text-sm">
      <Step n={1}>
        <div className="space-y-2">
          <div>
            Open GCash and send{" "}
            <span className="font-bold text-[var(--color-brand-700)]">{totalLabel}</span>{" "}
            to DinkHub:
          </div>
          {gcashQrImageUrl && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-3">
              <div className="mx-auto max-w-[240px]">
                {/* QR codes need exact pixels for scanability — let the browser
                    handle native sizing instead of next/image transforms. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gcashQrImageUrl}
                  alt="DinkHub GCash QR code"
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
              DinkHub GCash details unavailable — please email{" "}
              <a className="font-semibold underline" href="mailto:hello@dinkhub.ph">
                hello@dinkhub.ph
              </a>
              .
            </div>
          ) : null}
        </div>
      </Step>
      <Step n={2}>
        Enter exactly{" "}
        <span className="font-bold text-[var(--color-brand-700)]">{totalLabel}</span> as the amount.
        Make sure the GCash receipt screenshot shows the <strong>amount</strong> and{" "}
        <strong>reference number</strong>.
      </Step>
      <Step n={3}>
        <div className="space-y-2">
          <div>
            Add this <strong>invoice ID</strong> in the GCash message field so DinkHub can match
            your payment quickly:
          </div>
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] px-3 py-2">
            <code className="truncate font-mono text-sm font-semibold">{shortRef}</code>
            <CopyButton value={shortRef} label="invoice ID" size="sm" />
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
