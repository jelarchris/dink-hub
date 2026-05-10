import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listBookings } from "@/features/admin/service";
import {
  bookingListFilterSchema,
  type BookingListFilter,
} from "@/features/admin/schema";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { AdminFilters } from "../_components/filters";
import { Pagination } from "../_components/pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Bookings" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_OPTIONS: ReadonlyArray<{ value: BookingListFilter["status"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending_payment", label: "Pending payment" },
  { value: "payment_submitted", label: "Payment submitted" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
  { value: "no_show", label: "No-show" },
  { value: "refunded", label: "Refunded" },
];

export default async function AdminBookingsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const parsed = bookingListFilterSchema.safeParse(sp);
  const filter: BookingListFilter = parsed.success
    ? parsed.data
    : { status: "all", page: 1 };

  const result = await listBookings(filter);

  return (
    <Container className="py-8">
      <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">
        {result.total} total · page {result.page}
      </p>

      <AdminFilters
        className="mt-6"
        basePath="/admin/bookings"
        currentParams={Object.fromEntries(
          Object.entries(sp).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>}
        statusOptions={STATUS_OPTIONS}
        currentStatus={filter.status}
        searchPlaceholder="Search by player or venue…"
        currentQuery={filter.q ?? ""}
      />

      {result.rows.length === 0 ? (
        <EmptyState className="mt-6" title="No bookings match these filters" />
      ) : (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
          <table className="min-w-full divide-y divide-[var(--color-border-default)] text-sm">
            <thead className="bg-[var(--color-bg-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Player</th>
                <th className="px-4 py-2 font-medium">Venue / court</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-default)]">
              {result.rows.map((row) => (
                <tr key={row.booking.id} className="hover:bg-[var(--color-bg-muted)]/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/bookings/${row.booking.id}`}
                      className="text-[var(--color-brand-700)] hover:underline"
                    >
                      {formatDateTimeManila(row.booking.startAt)}
                    </Link>
                    <p className="text-xs text-[var(--color-fg-muted)]">
                      to {formatDateTimeManila(row.booking.endAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p className="font-medium">{row.playerName}</p>
                    <p className="text-[var(--color-fg-muted)]">{row.playerEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p>{row.venueName}</p>
                    <p className="text-[var(--color-fg-muted)]">{row.courtName}</p>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {formatPHP(row.booking.totalCentavos)}
                  </td>
                  <td className="px-4 py-3">
                    <BookingStatusBadge status={row.booking.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        className="mt-6"
        basePath="/admin/bookings"
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

function BookingStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "confirmed":
      return <Badge variant="success">{status}</Badge>;
    case "pending_payment":
    case "payment_submitted":
      return <Badge variant="info">{status}</Badge>;
    case "cancelled":
    case "expired":
    case "refunded":
      return <Badge variant="neutral">{status}</Badge>;
    case "no_show":
      return <Badge variant="warning">{status}</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}
