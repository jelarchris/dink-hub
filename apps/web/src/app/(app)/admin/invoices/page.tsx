import Link from "next/link";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { listAdminOwnerInvoices } from "@/features/admin/owner-invoices";
import {
  ownerInvoiceListFilterSchema,
  ownerInvoiceStatusValues,
  type OwnerInvoiceListFilter,
} from "@/features/admin";
import { formatPHP } from "@/lib/money";
import { AdminFilters } from "../_components/filters";
import { Pagination } from "../_components/pagination";
import { OwnerInvoiceStatusBadge } from "./_components/owner-invoice-status-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · DinkHub invoices" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_OPTIONS: ReadonlyArray<{
  value: OwnerInvoiceListFilter["status"];
  label: string;
}> = [
  { value: "submitted", label: "Awaiting verification" },
  { value: "all", label: "All" },
  ...ownerInvoiceStatusValues
    .filter((v) => v !== "submitted")
    .map((v) => ({ value: v, label: v.replace("_", " ") })),
];

const PERIOD_FMT = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});
const DATETIME_FMT = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

function formatPeriod(start: Date, end: Date): string {
  const inclusiveEnd = new Date(end.getTime() - 86_400_000);
  return `${PERIOD_FMT.format(start)} – ${PERIOD_FMT.format(inclusiveEnd)}`;
}

export default async function AdminOwnerInvoicesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const parsed = ownerInvoiceListFilterSchema.safeParse(sp);
  const filter: OwnerInvoiceListFilter = parsed.success
    ? parsed.data
    : { status: "submitted", page: 1 };

  const result = await listAdminOwnerInvoices(filter);

  return (
    <Container className="py-3 sm:py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">DinkHub invoices</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {result.total} total · page {result.page}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <AdminFilters
          basePath="/admin/invoices"
          currentParams={Object.fromEntries(
            Object.entries(sp).filter(([, v]) => typeof v === "string"),
          ) as Record<string, string>}
          statusOptions={STATUS_OPTIONS}
          currentStatus={filter.status}
          searchPlaceholder=""
          currentQuery=""
        />

        {result.rows.length === 0 ? (
          <EmptyState className="mt-6" title="No invoices match these filters" />
        ) : (
          <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
            <table className="min-w-full divide-y divide-[var(--color-border-default)] text-sm">
              <thead className="bg-[var(--color-bg-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">Venue</th>
                  <th className="px-4 py-2 font-medium">Bookings</th>
                  <th className="px-4 py-2 font-medium">Total</th>
                  <th className="px-4 py-2 font-medium">Submitted</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-default)]">
                {result.rows.map((row) => (
                  <tr
                    key={row.invoice.id}
                    className="hover:bg-[var(--color-bg-muted)]/30"
                  >
                    <td className="px-4 py-3 text-xs">
                      <Link
                        href={`/admin/invoices/${row.invoice.id}`}
                        className="font-medium text-[var(--color-brand-700)] hover:underline"
                      >
                        {formatPeriod(row.invoice.periodStart, row.invoice.periodEnd)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-medium">{row.venueName}</p>
                      <p className="text-[var(--color-fg-muted)]">{row.ownerEmail}</p>
                    </td>
                    <td className="px-4 py-3">{row.invoice.bookingCount}</td>
                    <td className="px-4 py-3 font-medium tabular-nums">
                      {formatPHP(row.invoice.totalCentavos)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.invoice.submittedAt
                        ? DATETIME_FMT.format(row.invoice.submittedAt)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <OwnerInvoiceStatusBadge status={row.invoice.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          className="mt-6"
          basePath="/admin/invoices"
          currentParams={Object.fromEntries(
            Object.entries(sp).filter(([, v]) => typeof v === "string"),
          ) as Record<string, string>}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
        />
      </div>
    </Container>
  );
}
