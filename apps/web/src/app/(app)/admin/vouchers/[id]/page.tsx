import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdmin } from "@/features/admin/service";
import { vouchersRepo } from "@/features/vouchers";
import { formatPHP } from "@/lib/money";
import { formatDateTimeManila } from "@/lib/date";
import { StatusForm } from "./status-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Voucher" };

export default async function VoucherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const voucher = await vouchersRepo.findVoucherWithVenueById(id);
  if (!voucher) notFound();

  const [stats, redemptions] = await Promise.all([
    vouchersRepo.getVoucherStats(id),
    vouchersRepo.listRedemptionsForVoucher(id),
  ]);

  const discount =
    voucher.discountType === "percent"
      ? `${voucher.discountValue.toString()}% off booking fee`
      : `${formatPHP(voucher.discountValue)} off booking fee`;

  return (
    <Container className="py-3 sm:py-4">
      <Link
        href="/admin/vouchers"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" /> Back to vouchers
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="font-mono text-2xl font-bold tracking-tight">{voucher.code}</h1>
        <StatusBadge status={voucher.status} />
      </div>
      <p className="text-sm text-[var(--color-fg-muted)]">{discount}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Redemptions" value={`${stats.redemptionCount}${voucher.maxRedemptions !== null ? ` / ${voucher.maxRedemptions}` : ""}`} />
        <StatCard label="Total discount given" value={formatPHP(stats.totalDiscountCentavos)} />
        <StatCard label="Per-player limit" value={voucher.maxPerUser === 0 ? "Unlimited" : voucher.maxPerUser.toString()} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-semibold">Details</h2>
            <DetailRow label="Created" value={formatDateTimeManila(voucher.createdAt)} />
            <DetailRow
              label="Valid until"
              value={voucher.validUntil ? formatDateTimeManila(voucher.validUntil) : "No expiry"}
            />
            <DetailRow
              label="Venue scope"
              value={voucher.venueName ?? "All venues (global)"}
            />
            <DetailRow
              label="Minimum court fee"
              value={voucher.minCourtFeeCentavos > 0n ? formatPHP(voucher.minCourtFeeCentavos) : "None"}
            />
            {voucher.notes && (
              <DetailRow label="Notes" value={voucher.notes} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-semibold">Manage status</h2>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Paused codes can be re-activated. Existing redemptions are never
              affected by status changes.
            </p>
            <StatusForm voucherId={voucher.id} currentStatus={voucher.status} />
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-10 text-lg font-semibold">Recent redemptions</h2>
      {redemptions.length === 0 ? (
        <EmptyState className="mt-4" title="No redemptions yet" />
      ) : (
        <div className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
          <table className="min-w-full divide-y divide-[var(--color-border-default)] text-sm">
            <thead className="bg-[var(--color-bg-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Booking</th>
                <th className="px-4 py-2 font-medium">Booking status</th>
                <th className="px-4 py-2 font-medium">Discount applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-default)]">
              {redemptions.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-xs">{formatDateTimeManila(r.createdAt)}</td>
                  <td className="px-4 py-3 text-xs">
                    <Link
                      href={`/admin/bookings/${r.bookingId}`}
                      className="font-mono text-[var(--color-brand-700)] hover:underline"
                    >
                      {r.bookingId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-fg-muted)]">
                    {r.bookingStatus ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">
                    {formatPHP(r.discountAppliedCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-[var(--color-fg-muted)]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "paused" | "expired" }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "paused") return <Badge variant="warning">Paused</Badge>;
  return <Badge variant="neutral">Expired</Badge>;
}
