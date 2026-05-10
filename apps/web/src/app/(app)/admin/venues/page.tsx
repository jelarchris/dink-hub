import Link from "next/link";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { listVenues } from "@/features/admin/service";
import { venueListFilterSchema, type VenueListFilter } from "@/features/admin/schema";
import { formatDateTimeManila } from "@/lib/date";
import { AdminFilters } from "../_components/filters";
import { Pagination } from "../_components/pagination";
import { VenueStatusBadge } from "../_components/venue-status-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Venues" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_OPTIONS: ReadonlyArray<{ value: VenueListFilter["status"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending_review", label: "Pending review" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected", label: "Rejected" },
];

export default async function AdminVenuesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const parsed = venueListFilterSchema.safeParse(sp);
  const filter: VenueListFilter = parsed.success
    ? parsed.data
    : { status: "all", page: 1 };

  const result = await listVenues(filter);

  return (
    <Container className="py-3 sm:py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Venues</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {result.total} total · showing page {result.page}
          </p>
        </div>
      </div>

      <AdminFilters
        className="mt-6"
        basePath="/admin/venues"
        currentParams={Object.fromEntries(
          Object.entries(sp).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>}
        statusOptions={STATUS_OPTIONS}
        currentStatus={filter.status}
        searchPlaceholder="Search by name or city…"
        currentQuery={filter.q ?? ""}
      />

      {result.rows.length === 0 ? (
        <EmptyState className="mt-6" title="No venues match these filters" />
      ) : (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
          <table className="min-w-full divide-y divide-[var(--color-border-default)] text-sm">
            <thead className="bg-[var(--color-bg-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Venue</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Courts</th>
                <th className="px-4 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-default)]">
              {result.rows.map(({ venue, ownerEmail, ownerName, courtCount }) => (
                <tr key={venue.id} className="hover:bg-[var(--color-bg-muted)]/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/venues/${venue.id}`}
                      className="font-medium text-[var(--color-brand-700)] hover:underline"
                    >
                      {venue.name}
                    </Link>
                    <p className="text-xs text-[var(--color-fg-muted)]">
                      {venue.city}, {venue.province}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs">{ownerName}</p>
                    <p className="text-xs text-[var(--color-fg-muted)]">{ownerEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <VenueStatusBadge status={venue.status} />
                  </td>
                  <td className="px-4 py-3 text-center">{courtCount}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-fg-muted)]">
                    {formatDateTimeManila(venue.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        className="mt-6"
        basePath="/admin/venues"
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
