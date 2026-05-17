import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Receipt } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { listInvoicesForOwner } from "@/features/owner-invoices";
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

  const rows = await listInvoicesForOwner(profile.id);

  return (
    <Container className="max-w-3xl py-3 sm:py-4">
      <PageHeader
        back={{ href: "/owner", label: "Owner dashboard" }}
        kicker="Owner"
        title="DinkHub invoices"
        subtitle="Weekly booking-fee invoices for your venues"
      />

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ol className="mt-3 grid gap-2">
          {rows.map(({ invoice, venue }) => (
            <li
              key={invoice.id}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] shadow-[var(--shadow-sm)] transition-shadow hover:shadow-md focus-within:shadow-md"
            >
              <Link
                href={`/owner/invoices/${invoice.id}`}
                className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
              >
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
                  <div className="flex items-center justify-end gap-1 text-base font-semibold tabular-nums">
                    {formatPHP(invoice.totalCentavos)}
                    <ArrowUpRight className="size-4 text-[var(--color-fg-muted)]" />
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                    {invoice.status === "verified" && invoice.verifiedAt
                      ? `Paid ${formatDueDate(invoice.verifiedAt)}`
                      : `Due ${formatDueDate(invoice.dueDate)}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Container>
  );
}

function EmptyState() {
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
