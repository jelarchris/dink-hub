import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listLateConfirmCandidates } from "@/features/bookings-view";
import {
  AUTO_VALIDATION_RULES,
  isAutoValidationFailureCode,
} from "@/features/booking/auto-validation";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { LateConfirmForm } from "./late-confirm-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Late-confirm payments" };

export default async function AdminLateConfirmPage() {
  const rows = await listLateConfirmCandidates(100);

  return (
    <Container className="py-3 sm:py-4">
      <PageHeader
        back={{ href: "/admin", label: "Admin" }}
        kicker="Admin"
        title="Late-confirm payments"
        subtitle="Bookings whose session already ended but payment is still in 'payment submitted'. Use this only when the owner is unreachable AND the player has documented evidence the session occurred."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="Nothing stuck"
          description="No past-end bookings are awaiting verification."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const failures = row.payment.autoValidationFailures.filter(isAutoValidationFailureCode);
            const autoPassed =
              row.payment.autoValidatedAt !== null && row.payment.autoValidationFailures.length === 0;
            return (
              <Card key={row.payment.id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">
                        {row.venue.name} · {row.court.name}
                      </div>
                      <div className="text-sm text-[var(--color-fg-muted)]">
                        {formatDateTimeManila(row.booking.startAt)} → {formatDateTimeManila(row.booking.endAt)}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold">{formatPHP(row.booking.totalCentavos)}</div>
                      <div className="text-xs text-[var(--color-fg-muted)]">
                        ref {row.payment.gcashReferenceNumber ?? "—"}
                      </div>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-[var(--color-fg-muted)]">Player</dt>
                      <dd className="font-medium">{row.playerDisplayName}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--color-fg-muted)]">Owner</dt>
                      <dd className="font-medium">{row.ownerDisplayName}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--color-fg-muted)]">Submitted</dt>
                      <dd>{formatDateTimeManila(row.payment.submittedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--color-fg-muted)]">Auto-checks</dt>
                      <dd>
                        {autoPassed ? (
                          <Badge variant="success">Passed</Badge>
                        ) : row.payment.autoValidatedAt ? (
                          <Badge variant="warning">{failures.length} flagged</Badge>
                        ) : (
                          <Badge variant="neutral">Not run</Badge>
                        )}
                      </dd>
                    </div>
                  </dl>

                  {failures.length > 0 && (
                    <ul className="space-y-1 text-xs">
                      {failures.map((code) => {
                        const rule = AUTO_VALIDATION_RULES[code];
                        return (
                          <li key={code} className="flex items-start gap-2">
                            <Badge variant={rule.severity}>{rule.label}</Badge>
                            <span className="pt-0.5 text-[var(--color-fg-muted)]">{rule.adminHint}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <LateConfirmForm paymentId={row.payment.id} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </Container>
  );
}
