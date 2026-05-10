import Link from "next/link";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { listPayouts, listVenuesEligibleForPayout } from "@/features/admin/payouts";
import {
  payoutListFilterSchema,
  payoutStatusValues,
  type PayoutListFilter,
} from "@/features/admin/schema";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { AdminFilters } from "../_components/filters";
import { Pagination } from "../_components/pagination";
import { GeneratePayoutForm } from "./_components/generate-payout-form";
import { PayoutStatusBadge } from "./_components/payout-status-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Payouts" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_OPTIONS: ReadonlyArray<{ value: PayoutListFilter["status"]; label: string }> = [
  { value: "all", label: "All" },
  ...payoutStatusValues.map((v) => ({ value: v, label: v.replace("_", " ") })),
];

export default async function AdminPayoutsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const parsed = payoutListFilterSchema.safeParse(sp);
  const filter: PayoutListFilter = parsed.success ? parsed.data : { status: "all", page: 1 };

  const [result, eligibleVenues] = await Promise.all([
    listPayouts(filter),
    listVenuesEligibleForPayout(),
  ]);

  return (
    <Container className="py-3 sm:py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Payouts</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {result.total} total · page {result.page}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <AdminFilters
            basePath="/admin/payouts"
            currentParams={Object.fromEntries(
              Object.entries(sp).filter(([, v]) => typeof v === "string"),
            ) as Record<string, string>}
            statusOptions={STATUS_OPTIONS}
            currentStatus={filter.status}
            searchPlaceholder=""
            currentQuery=""
          />

          {result.rows.length === 0 ? (
            <EmptyState className="mt-6" title="No payouts match these filters" />
          ) : (
            <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
              <table className="min-w-full divide-y divide-[var(--color-border-default)] text-sm">
                <thead className="bg-[var(--color-bg-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                  <tr>
                    <th className="px-4 py-2 font-medium">Period</th>
                    <th className="px-4 py-2 font-medium">Venue</th>
                    <th className="px-4 py-2 font-medium">Bookings</th>
                    <th className="px-4 py-2 font-medium">Gross</th>
                    <th className="px-4 py-2 font-medium">Fees</th>
                    <th className="px-4 py-2 font-medium">Net</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-default)]">
                  {result.rows.map((row) => (
                    <tr key={row.payout.id} className="hover:bg-[var(--color-bg-muted)]/30">
                      <td className="px-4 py-3 text-xs">
                        <Link
                          href={`/admin/payouts/${row.payout.id}`}
                          className="text-[var(--color-brand-700)] hover:underline"
                        >
                          {formatDateTimeManila(row.payout.periodStart)}
                        </Link>
                        <p className="text-[var(--color-fg-muted)]">
                          to {formatDateTimeManila(row.payout.periodEnd)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p className="font-medium">{row.venueName}</p>
                        <p className="text-[var(--color-fg-muted)]">{row.ownerEmail}</p>
                      </td>
                      <td className="px-4 py-3">{row.payout.bookingCount}</td>
                      <td className="px-4 py-3">{formatPHP(row.payout.grossCentavos)}</td>
                      <td className="px-4 py-3">{formatPHP(row.payout.feesCentavos)}</td>
                      <td className="px-4 py-3 font-medium">
                        {formatPHP(row.payout.netCentavos)}
                      </td>
                      <td className="px-4 py-3">
                        <PayoutStatusBadge status={row.payout.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            className="mt-6"
            basePath="/admin/payouts"
            currentParams={Object.fromEntries(
              Object.entries(sp).filter(([, v]) => typeof v === "string"),
            ) as Record<string, string>}
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
          />
        </div>

        <aside>
          <GeneratePayoutForm venues={eligibleVenues} />
        </aside>
      </div>
    </Container>
  );
}
