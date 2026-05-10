import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { isAdminError } from "@/features/admin";
import { getPayoutDetail } from "@/features/admin/payouts";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { HoldToggleForm } from "../_components/hold-toggle-form";
import { MarkPaidForm } from "../_components/mark-paid-form";
import { PayoutStatusBadge } from "../_components/payout-status-badge";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminPayoutDetailPage({ params }: PageProps) {
  const { id } = await params;

  let detail;
  try {
    detail = await getPayoutDetail(id);
  } catch (err) {
    if (isAdminError(err)) notFound();
    throw err;
  }

  const { payout, venueId, venueName, ownerEmail, ownerName, ledger } = detail;
  const canMarkPaid = payout.status === "pending" || payout.status === "processing";
  const canHold = payout.status === "pending";
  const canRelease = payout.status === "on_hold";

  return (
    <Container className="py-8">
      <Link
        href="/admin/payouts"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" /> Back to payouts
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{venueName}</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {formatDateTimeManila(payout.periodStart)} –{" "}
            {formatDateTimeManila(payout.periodEnd)}
          </p>
        </div>
        <PayoutStatusBadge status={payout.status} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-semibold">Summary</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <Row label="Bookings" value={String(payout.bookingCount)} />
              <Row label="Gross" value={formatPHP(payout.grossCentavos)} />
              <Row label="Fees" value={formatPHP(payout.feesCentavos)} />
              <Row label="Carryover" value={formatPHP(payout.carryoverCentavos)} />
              <Row label="Net to venue" value={formatPHP(payout.netCentavos)} />
              <Row label="Created" value={formatDateTimeManila(payout.createdAt)} />
              {payout.paidAt && (
                <>
                  <Row label="Paid at" value={formatDateTimeManila(payout.paidAt)} />
                  <Row label="Reference" value={payout.paidReference ?? "—"} />
                </>
              )}
            </dl>
            {payout.notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{payout.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 pt-6">
              <h2 className="font-semibold">Venue</h2>
              <Link
                href={`/admin/venues/${venueId}`}
                className="text-sm font-medium text-[var(--color-brand-700)] hover:underline"
              >
                {venueName}
              </Link>
              <p className="text-xs text-[var(--color-fg-muted)]">
                Owner: {ownerName} ({ownerEmail})
              </p>
            </CardContent>
          </Card>

          {canMarkPaid && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <h2 className="font-semibold">Mark as paid</h2>
                <p className="text-xs text-[var(--color-fg-muted)]">
                  Writes settlement entries to the ledger.
                </p>
                <MarkPaidForm payoutId={payout.id} version={payout.version} />
              </CardContent>
            </Card>
          )}

          {canHold && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <h2 className="font-semibold">Place on hold</h2>
                <HoldToggleForm
                  payoutId={payout.id}
                  version={payout.version}
                  action="hold"
                />
              </CardContent>
            </Card>
          )}

          {canRelease && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <h2 className="font-semibold">On hold</h2>
                <HoldToggleForm
                  payoutId={payout.id}
                  version={payout.version}
                  action="release"
                />
              </CardContent>
            </Card>
          )}

          {!canMarkPaid && !canHold && !canRelease && (
            <Alert variant="info" className="text-xs">
              No further actions available for this payout.
            </Alert>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold">Settlement ledger</h2>
        <p className="text-xs text-[var(--color-fg-muted)]">
          Entries written when this payout transitioned to <em>paid</em>.
        </p>
        {ledger.length === 0 ? (
          <Alert variant="info" className="mt-3 text-xs">
            No ledger entries yet — payout has not been marked paid.
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
      <dt className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}
