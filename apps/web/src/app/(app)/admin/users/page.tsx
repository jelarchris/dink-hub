import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listUsers } from "@/features/admin/service";
import { userListFilterSchema, type UserListFilter } from "@/features/admin/schema";
import { formatDateTimeManila } from "@/lib/date";
import { AdminFilters } from "../_components/filters";
import { Pagination } from "../_components/pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Users" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ROLE_OPTIONS: ReadonlyArray<{ value: UserListFilter["role"]; label: string }> = [
  { value: "all", label: "All roles" },
  { value: "player", label: "Player" },
  { value: "venue_owner", label: "Venue owner" },
  { value: "admin", label: "Admin" },
];

const STATUS_OPTIONS: ReadonlyArray<{ value: UserListFilter["status"]; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const parsed = userListFilterSchema.safeParse(sp);
  const filter: UserListFilter = parsed.success
    ? parsed.data
    : { role: "all", status: "all", page: 1 };

  const result = await listUsers(filter);

  return (
    <Container className="py-8">
      <h1 className="text-2xl font-bold tracking-tight">Users</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">
        {result.total} total · page {result.page}
      </p>

      <AdminFilters
        className="mt-6"
        basePath="/admin/users"
        currentParams={Object.fromEntries(
          Object.entries(sp).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>}
        statusOptions={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        currentStatus={filter.role}
        searchPlaceholder="Search by email or name…"
        currentQuery={filter.q ?? ""}
        extraSelects={[
          {
            name: "status",
            currentValue: filter.status,
            options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          },
        ]}
      />

      {result.rows.length === 0 ? (
        <EmptyState className="mt-6" title="No users match these filters" />
      ) : (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
          <table className="min-w-full divide-y divide-[var(--color-border-default)] text-sm">
            <thead className="bg-[var(--color-bg-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Venues</th>
                <th className="px-4 py-2 font-medium">Bookings</th>
                <th className="px-4 py-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-default)]">
              {result.rows.map(({ profile, venueCount, bookingCount }) => (
                <tr key={profile.id} className="hover:bg-[var(--color-bg-muted)]/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${profile.id}`}
                      className="font-medium text-[var(--color-brand-700)] hover:underline"
                    >
                      {profile.displayName}
                    </Link>
                    <p className="text-xs text-[var(--color-fg-muted)]">{profile.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={profile.role} />
                  </td>
                  <td className="px-4 py-3">
                    {profile.suspendedAt ? (
                      <Badge variant="danger">Suspended</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">{venueCount}</td>
                  <td className="px-4 py-3 text-center">{bookingCount}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-fg-muted)]">
                    {formatDateTimeManila(profile.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        className="mt-6"
        basePath="/admin/users"
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

function RoleBadge({ role }: { role: "player" | "venue_owner" | "admin" }) {
  switch (role) {
    case "admin":
      return <Badge variant="warning">Admin</Badge>;
    case "venue_owner":
      return <Badge variant="info">Owner</Badge>;
    default:
      return <Badge variant="neutral">Player</Badge>;
  }
}
