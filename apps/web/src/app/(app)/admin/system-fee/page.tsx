import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentSystemFee, listSystemFeeHistory } from "@/features/admin/service";
import { formatPHP } from "@/lib/money";
import { formatDateTimeManila } from "@/lib/date";
import { UpdateFeeForm } from "./update-fee-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · System fee" };

export default async function AdminSystemFeePage() {
  const [current, history] = await Promise.all([
    getCurrentSystemFee(),
    listSystemFeeHistory(),
  ]);

  return (
    <Container className="py-8">
      <h1 className="text-2xl font-bold tracking-tight">System fee</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">
        Snapshotted to every new booking — historical bookings keep their old rate.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-semibold">Current rate</h2>
            <p className="text-4xl font-bold tracking-tight">
              {current ? formatPHP(current.feeAmountCentavos) : "—"}
            </p>
            {current && (
              <p className="text-xs text-[var(--color-fg-muted)]">
                Effective from {formatDateTimeManila(current.effectiveFrom)}
              </p>
            )}
            {current?.notes && (
              <p className="text-sm text-[var(--color-fg-muted)]">{current.notes}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-semibold">Update rate</h2>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Creates a new history row. Existing bookings are unaffected.
            </p>
            <UpdateFeeForm />
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-10 text-lg font-semibold">History</h2>
      {history.length === 0 ? (
        <EmptyState className="mt-4" title="No fee history yet" />
      ) : (
        <div className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
          <table className="min-w-full divide-y divide-[var(--color-border-default)] text-sm">
            <thead className="bg-[var(--color-bg-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Effective from</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Updated by</th>
                <th className="px-4 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-default)]">
              {history.map(({ setting, updatedByEmail }) => (
                <tr key={setting.id}>
                  <td className="px-4 py-3 text-xs">{formatDateTimeManila(setting.effectiveFrom)}</td>
                  <td className="px-4 py-3 font-medium">{formatPHP(setting.feeAmountCentavos)}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-fg-muted)]">
                    {updatedByEmail ?? "system"}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-fg-muted)]">
                    {setting.notes ?? "—"}
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
