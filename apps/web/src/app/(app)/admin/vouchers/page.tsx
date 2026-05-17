import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdmin } from "@/features/admin/service";
import { vouchersRepo } from "@/features/vouchers";
import { formatPHP } from "@/lib/money";
import { formatDateTimeManila } from "@/lib/date";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Vouchers" };

export default async function AdminVouchersPage() {
  await requireAdmin();
  const vouchers = await vouchersRepo.listVouchers();

  return (
    <Container className="py-3 sm:py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Vouchers</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Discount codes that reduce the booking fee. Court fees are never discounted.
          </p>
        </div>
        <Link
          href="/admin/vouchers/new"
          className="inline-flex h-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-500)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-sm)] hover:bg-[var(--color-brand-600)]"
        >
          New voucher
        </Link>
      </div>

      <div className="mt-6">
        {vouchers.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <EmptyState
                title="No vouchers yet"
                description="Create your first voucher to give players a discount on the booking fee."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
            <table className="min-w-full divide-y divide-[var(--color-border-default)] text-sm">
              <thead className="bg-[var(--color-bg-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 font-medium">Discount</th>
                  <th className="px-4 py-2 font-medium">Venue</th>
                  <th className="px-4 py-2 font-medium">Used</th>
                  <th className="px-4 py-2 font-medium">Per user</th>
                  <th className="px-4 py-2 font-medium">Valid until</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-default)]">
                {vouchers.map((v) => {
                  const usage =
                    v.maxRedemptions === null
                      ? `${v.redemptionCount} / ∞`
                      : `${v.redemptionCount} / ${v.maxRedemptions}`;
                  const discount =
                    v.discountType === "percent"
                      ? `${v.discountValue.toString()}% off fee`
                      : `${formatPHP(v.discountValue)} off fee`;
                  return (
                    <tr key={v.id}>
                      <td className="px-4 py-3 font-mono text-xs font-bold">{v.code}</td>
                      <td className="px-4 py-3">{discount}</td>
                      <td className="px-4 py-3 text-xs">
                        {v.venueName ? (
                          <span className="font-medium">{v.venueName}</span>
                        ) : (
                          <span className="text-[var(--color-fg-subtle)]">All venues</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">{usage}</td>
                      <td className="px-4 py-3 text-xs">
                        {v.maxPerUser === 0 ? "∞" : v.maxPerUser}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-fg-muted)]">
                        {v.validUntil ? formatDateTimeManila(v.validUntil) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={v.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/vouchers/${v.id}`}
                          className="text-xs font-semibold text-[var(--color-brand-700)] hover:underline"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Container>
  );
}

function StatusBadge({ status }: { status: "active" | "paused" | "expired" }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "paused") return <Badge variant="warning">Paused</Badge>;
  return <Badge variant="neutral">Expired</Badge>;
}
