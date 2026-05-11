import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { isAdminError } from "@/features/admin";
import { getAdminOwnerInvoiceDetail } from "@/features/admin/owner-invoices";
import { getReceiptSignedUrl } from "@/features/storage";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { OwnerInvoiceStatusBadge } from "../_components/owner-invoice-status-badge";
import { RejectInvoiceForm } from "../_components/reject-invoice-form";
import { VerifyInvoiceForm } from "../_components/verify-invoice-form";
import { VoidInvoiceForm } from "../_components/void-invoice-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Invoice" };

interface PageProps {
  params: Promise<{ id: string }>;
}

const PERIOD_FMT = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});

function formatPeriod(start: Date, end: Date): string {
  const inclusiveEnd = new Date(end.getTime() - 86_400_000);
  return `${PERIOD_FMT.format(start)} – ${PERIOD_FMT.format(inclusiveEnd)}`;
}

function formatDueDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(`${value}T00:00:00+08:00`) : value;
  return PERIOD_FMT.format(d);
}

export default async function AdminInvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;

  let detail;
  try {
    detail = await getAdminOwnerInvoiceDetail(id);
  } catch (err) {
    if (isAdminError(err)) notFound();
    throw err;
  }

  const { invoice, venue, owner, submittedByEmail, ledger } = detail;
  const isVerifiable = invoice.status === "submitted";
  const isVoidable =
    invoice.status === "open" ||
    invoice.status === "submitted" ||
    invoice.status === "rejected";

  // Receipt is private — admin-authorized signed URL with 5-min TTL.
  const receiptUrl = invoice.receiptImagePath
    ? await getReceiptSignedUrl(invoice.receiptImagePath)
    : null;

  return (
    <Container className="py-3 sm:py-4">
      <Link
        href="/admin/invoices"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" /> Back to invoices
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{venue.name}</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {formatPeriod(invoice.periodStart, invoice.periodEnd)}
          </p>
        </div>
        <OwnerInvoiceStatusBadge status={invoice.status} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-semibold">Summary</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <Row label="Bookings" value={String(invoice.bookingCount)} />
              <Row label="Booking fees" value={formatPHP(invoice.feesCentavos)} />
              <Row label="Carryover" value={formatPHP(invoice.carryoverCentavos)} />
              <Row label="Total due" value={formatPHP(invoice.totalCentavos)} />
              <Row label="Due date" value={formatDueDate(invoice.dueDate)} />
              <Row label="Created" value={formatDateTimeManila(invoice.createdAt)} />
              {invoice.amountPaidCentavos !== null && (
                <Row
                  label="Amount paid"
                  value={formatPHP(invoice.amountPaidCentavos)}
                />
              )}
              {invoice.gcashReferenceNumber && (
                <Row label="GCash ref" value={invoice.gcashReferenceNumber} />
              )}
              {invoice.submittedAt && (
                <Row
                  label="Submitted"
                  value={formatDateTimeManila(invoice.submittedAt)}
                />
              )}
              {submittedByEmail && (
                <Row label="Submitted by" value={submittedByEmail} />
              )}
              {invoice.verifiedAt && (
                <Row
                  label="Verified"
                  value={formatDateTimeManila(invoice.verifiedAt)}
                />
              )}
            </dl>
            {invoice.rejectionReason && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
                  Previous rejection reason
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-fg)]">
                  {invoice.rejectionReason}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 pt-6">
              <h2 className="font-semibold">Venue</h2>
              <Link
                href={`/admin/venues/${venue.id}`}
                className="text-sm font-medium text-[var(--color-brand-700)] hover:underline"
              >
                {venue.name}
              </Link>
              <p className="text-xs text-[var(--color-fg-muted)]">
                Owner: {owner.displayName} ({owner.email})
              </p>
            </CardContent>
          </Card>

          {isVerifiable && (
            <>
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <h2 className="font-semibold">Verify &amp; settle</h2>
                  <p className="text-xs text-[var(--color-fg-muted)]">
                    Confirms cash receipt and writes balanced ledger entries
                    (D platform_cash / C venue_payable) at the invoice total.
                  </p>
                  <VerifyInvoiceForm
                    invoiceId={invoice.id}
                    version={invoice.version}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 pt-6">
                  <h2 className="font-semibold">Reject receipt</h2>
                  <p className="text-xs text-[var(--color-fg-muted)]">
                    Owner is emailed and can re-upload a corrected receipt.
                  </p>
                  <RejectInvoiceForm
                    invoiceId={invoice.id}
                    version={invoice.version}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {isVoidable && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <h2 className="font-semibold">Void invoice</h2>
                <p className="text-xs text-[var(--color-fg-muted)]">
                  Permanently cancels this invoice. Use for dispute resolution
                  or data corrections. Verified invoices cannot be voided.
                </p>
                <VoidInvoiceForm
                  invoiceId={invoice.id}
                  version={invoice.version}
                />
              </CardContent>
            </Card>
          )}

          {!isVerifiable && !isVoidable && (
            <Alert variant="info" className="text-xs">
              No further actions available — this invoice is{" "}
              <strong>{invoice.status}</strong>.
            </Alert>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold">GCash receipt</h2>
        {receiptUrl ? (
          <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-4">
            <div className="mx-auto max-w-[640px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptUrl}
                alt="GCash receipt uploaded by venue owner"
                className="h-auto w-full rounded-[var(--radius-sm)] bg-white object-contain"
                loading="lazy"
                decoding="async"
              />
            </div>
            <p className="mt-3 text-center text-xs text-[var(--color-fg-muted)]">
              Signed URL expires in 5 minutes — refresh the page to renew.
            </p>
          </div>
        ) : (
          <Alert variant="info" className="mt-3 text-xs">
            No receipt uploaded yet.
          </Alert>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold">Ledger entries</h2>
        <p className="text-xs text-[var(--color-fg-muted)]">
          Entries written when this invoice was verified.
        </p>
        {ledger.length === 0 ? (
          <Alert variant="info" className="mt-3 text-xs">
            No ledger entries yet — invoice has not been verified.
          </Alert>
        ) : (
          <div className="mt-3 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
            <table className="min-w-full divide-y divide-[var(--color-border-default)] text-sm">
              <thead className="bg-[var(--color-bg-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Direction</th>
                  <th className="px-4 py-2 font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-default)]">
                {ledger.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 text-xs">
                      {formatDateTimeManila(e.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs">{e.account}</td>
                    <td className="px-4 py-3 text-xs">{e.direction}</td>
                    <td className="px-4 py-3 font-medium">
                      {formatPHP(e.amountCentavos)}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-fg-muted)]">
                      {e.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Container>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}
