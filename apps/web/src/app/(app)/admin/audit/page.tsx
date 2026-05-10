import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listAuditLog } from "@/features/admin/service";
import { auditListFilterSchema, type AuditListFilter } from "@/features/admin/schema";
import { formatDateTimeManila } from "@/lib/date";
import { Pagination } from "../_components/pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Audit log" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const parsed = auditListFilterSchema.safeParse(sp);
  const filter: AuditListFilter = parsed.success ? parsed.data : { page: 1 };

  const result = await listAuditLog(filter);

  return (
    <Container className="py-8">
      <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">
        {result.total} total entries · append-only · page {result.page}
      </p>

      {/* Lightweight inline filters — no shared component because the field set is unique. */}
      <form
        action="/admin/audit"
        method="get"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3"
      >
        <FilterInput name="action" label="Action" value={filter.action} placeholder="venue.approve" />
        <FilterInput name="targetType" label="Target type" value={filter.targetType} placeholder="venue" />
        <button
          type="submit"
          className="mb-[1px] inline-flex h-8 items-center rounded-[var(--radius-md)] bg-[var(--color-brand-500)] px-3 text-sm font-medium text-white hover:bg-[var(--color-brand-600)]"
        >
          Apply
        </button>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState className="mt-6" title="No audit entries match these filters" />
      ) : (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
          <table className="min-w-full divide-y divide-[var(--color-border-default)] text-sm">
            <thead className="bg-[var(--color-bg-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-4 py-2 font-medium">Reason</th>
                <th className="px-4 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-default)]">
              {result.rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-[var(--color-bg-muted)]/30">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--color-fg-muted)]">
                    {formatDateTimeManila(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-xs">{row.actorEmail}</td>
                  <td className="px-4 py-3">
                    <Badge variant="neutral">{row.action}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p>{row.targetType}</p>
                    {row.targetId && (
                      <p className="font-mono text-[var(--color-fg-muted)]">
                        {row.targetId.slice(0, 8)}…
                      </p>
                    )}
                  </td>
                  <td className="max-w-[200px] px-4 py-3 text-xs text-[var(--color-fg-muted)]">
                    {row.reason ?? "—"}
                  </td>
                  <td className="max-w-[280px] px-4 py-3 text-xs text-[var(--color-fg-muted)]">
                    {row.before || row.after ? (
                      <details>
                        <summary className="cursor-pointer text-[var(--color-brand-700)]">
                          show
                        </summary>
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-[var(--color-bg-muted)]/40 p-2 text-[10px]">
{JSON.stringify({ before: row.before, after: row.after }, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        className="mt-6"
        basePath="/admin/audit"
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

function FilterInput({
  name,
  label,
  value,
  placeholder,
}: {
  name: string;
  label: string;
  value: string | undefined;
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={`audit-${name}`} className="block text-xs font-medium text-[var(--color-fg-muted)]">
        {label}
      </label>
      <input
        id={`audit-${name}`}
        name={name}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        className="mt-1 h-8 w-44 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
      />
    </div>
  );
}
