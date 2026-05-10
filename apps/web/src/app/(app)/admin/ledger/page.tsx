import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listLedger } from "@/features/admin/ledger";
import {
  ledgerAccountValues,
  ledgerListFilterSchema,
  type LedgerListFilter,
} from "@/features/admin/schema";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { AdminFilters } from "../_components/filters";
import { Pagination } from "../_components/pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Ledger" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ACCOUNT_OPTIONS: ReadonlyArray<{ value: LedgerListFilter["account"]; label: string }> = [
  { value: "all", label: "All accounts" },
  ...ledgerAccountValues.map((v) => ({ value: v, label: v.replace("_", " ") })),
];

export default async function AdminLedgerPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const parsed = ledgerListFilterSchema.safeParse(sp);
  const filter: LedgerListFilter = parsed.success ? parsed.data : { account: "all", page: 1 };

  const result = await listLedger(filter);

  return (
    <Container className="py-8">
      <h1 className="text-2xl font-bold tracking-tight">Ledger</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">
        {result.total} entries · page {result.page}
      </p>

      <Card className="mt-6">
        <CardContent className="pt-6">
          <h2 className="text-sm font-semibold">Totals (filtered)</h2>
          {result.totalsByAccount.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
              No entries match the current filter.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {result.totalsByAccount.map((t) => {
                const balance = t.debit - t.credit;
                return (
                  <div
                    key={t.account}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-3 text-sm"
                  >
                    <p className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                      {t.account}
                    </p>
                    <dl className="mt-1 grid grid-cols-2 gap-x-3 text-xs">
                      <dt className="text-[var(--color-fg-muted)]">Debit</dt>
                      <dd className="text-right">{formatPHP(t.debit)}</dd>
                      <dt className="text-[var(--color-fg-muted)]">Credit</dt>
                      <dd className="text-right">{formatPHP(t.credit)}</dd>
                      <dt className="text-[var(--color-fg-muted)]">Balance</dt>
                      <dd className="text-right font-medium">{formatPHP(balance)}</dd>
                    </dl>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AdminFilters
        className="mt-6"
        basePath="/admin/ledger"
        currentParams={Object.fromEntries(
          Object.entries(sp).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>}
        statusOptions={ACCOUNT_OPTIONS}
        currentStatus={filter.account}
        searchPlaceholder=""
        currentQuery=""
      />

      {result.rows.length === 0 ? (
        <EmptyState className="mt-6" title="No ledger entries match this filter" />
      ) : (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
          <table className="min-w-full divide-y divide-[var(--color-border-default)] text-sm">
            <thead className="bg-[var(--color-bg-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 font-medium">Direction</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-default)]">
              {result.rows.map(({ entry, createdByEmail }) => (
                <tr key={entry.id} className="hover:bg-[var(--color-bg-muted)]/30">
                  <td className="px-4 py-3 text-xs">
                    {formatDateTimeManila(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-xs">{entry.account}</td>
                  <td className="px-4 py-3 text-xs">
                    <Badge variant={entry.direction === "debit" ? "info" : "neutral"}>
                      {entry.direction}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {formatPHP(entry.amountCentavos)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {entry.bookingId && (
                      <Link
                        href={`/admin/bookings/${entry.bookingId}`}
                        className="text-[var(--color-brand-700)] hover:underline"
                      >
                        booking
                      </Link>
                    )}
                    {entry.payoutId && (
                      <Link
                        href={`/admin/payouts/${entry.payoutId}`}
                        className="text-[var(--color-brand-700)] hover:underline"
                      >
                        payout
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-fg-muted)]">
                    {entry.description}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-fg-muted)]">
                    {createdByEmail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        className="mt-6"
        basePath="/admin/ledger"
        currentParams={Object.fromEntries(
          Object.entries(sp).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </Container>
  );
}
