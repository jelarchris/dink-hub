import { redirect } from "next/navigation";
import { Receipt, Sparkles } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { listInvoicesForOwner } from "@/features/owner-invoices";
import { getPromoState } from "@/features/system-settings";
import { formatPHP } from "@/lib/money";
import type { OwnerInvoice } from "@/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "DinkHub invoices" };

const PERIOD_FMT = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  timeZone: "Asia/Manila",
});
const DUE_FMT = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "Asia/Manila",
});

function formatPeriod(start: Date, end: Date): string {
  // end is exclusive; show inclusive end (end - 1 day) for human readability.
  const inclusiveEnd = new Date(end.getTime() - 86_400_000);
  return `${PERIOD_FMT.format(start)} – ${PERIOD_FMT.format(inclusiveEnd)}`;
}

function formatDueDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(`${value}T00:00:00+08:00`) : value;
  return DUE_FMT.format(d);
}

function statusBadge(status: OwnerInvoice["status"]): React.ReactNode {
  switch (status) {
    case "open":
      return <Badge variant="warning">Open</Badge>;
    case "submitted":
      return <Badge variant="info">Awaiting verification</Badge>;
    case "verified":
      return <Badge variant="success">Paid</Badge>;
    case "rejected":
      return <Badge variant="danger">Rejected</Badge>;
    case "void":
      return <Badge variant="neutral">Void</Badge>;
  }
}

export default async function OwnerInvoicesPage() {
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent("/owner/invoices")}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-4">
        <Alert variant="warning" title="Owner access required">
          Your account isn&apos;t set up as a venue owner.
        </Alert>
      </Container>
    );
  }

  const [rows, promo] = await Promise.all([
    listInvoicesForOwner(profile.id),
    getPromoState(),
  ]);

  return (
    <Container className="max-w-3xl py-3 sm:py-4">
      <PageHeader
        back={{ href: "/owner", label: "Owner dashboard" }}
        kicker="Owner"
        title="DinkHub invoices"
        subtitle="Weekly booking-fee invoices for your venues"
      />

      {rows.length === 0 ? (
        <EmptyState promoActive={promo.active} promoUntil={promo.untilDate} />
      ) : (
        <ol className="mt-3 grid gap-2">
          {rows.map(({ invoice, venue }) => (
            <li
              key={invoice.id}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{venue.name}</span>
                    {statusBadge(invoice.status)}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                    {formatPeriod(invoice.periodStart, invoice.periodEnd)} ·{" "}
                    {invoice.bookingCount} booking{invoice.bookingCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-base font-semibold tabular-nums">
                    {formatPHP(invoice.totalCentavos)}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                    {invoice.status === "verified" && invoice.verifiedAt
                      ? `Paid ${formatDueDate(invoice.verifiedAt)}`
                      : `Due ${formatDueDate(invoice.dueDate)}`}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Container>
  );
}

function EmptyState({ promoActive, promoUntil }: { promoActive: boolean; promoUntil: string | null }) {
  if (promoActive) {
    return (
      <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--color-brand-300)] bg-gradient-to-br from-[var(--color-brand-50)] via-[var(--color-brand-100)] to-white p-6 text-center text-[var(--color-brand-900)] shadow-[var(--shadow-sm)]">
        <Sparkles className="mx-auto size-8 text-[var(--color-brand-700)]" />
        <h2 className="mt-2 text-lg font-semibold">No invoices yet — promo active</h2>
        <p className="mt-1 text-sm">
          Booking fees are waived during the launch promo
          {promoUntil ? ` until ${formatDueDate(promoUntil)}` : ""}. We&apos;ll email you the first
          invoice once the promo ends.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-6 text-center shadow-[var(--shadow-sm)]">
      <Receipt className="mx-auto size-8 text-[var(--color-fg-muted)]" />
      <h2 className="mt-2 text-lg font-semibold">No invoices yet</h2>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        Once you have confirmed bookings with booking fees, weekly invoices will appear here every
        Monday morning.
      </p>
    </div>
  );
}
