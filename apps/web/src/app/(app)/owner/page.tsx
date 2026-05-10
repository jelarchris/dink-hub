import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Layers, Receipt } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { listPendingPaymentsForOwner } from "@/features/bookings-view";
import { OwnerBalanceCard } from "@/features/owner-invoices/components/owner-balance-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner dashboard" };

export default async function OwnerDashboard() {
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent("/owner")}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-4">
        <Alert variant="warning" title="Owner access required">
          Your account isn&apos;t set up as a venue owner. Contact us to list a venue.
        </Alert>
      </Container>
    );
  }

  const pending = await listPendingPaymentsForOwner(profile.id);
  const pendingCount = pending.length;

  return (
    <Container className="py-3 sm:py-4">
      <PageHeader
        kicker="Owner"
        title={`Hello, ${profile.displayName.split(" ")[0] ?? profile.displayName}`}
        subtitle={`${pendingCount} payment${pendingCount === 1 ? "" : "s"} awaiting verification`}
        action={
          pendingCount > 0 ? (
            <Link href="/owner/payments" className={buttonVariants({ size: "sm" })}>
              Review {pendingCount}
            </Link>
          ) : undefined
        }
      />

      <div className="mt-3">
        <OwnerBalanceCard ownerId={profile.id} />
      </div>

      <ul className="mt-4 divide-y divide-[var(--color-border-default)]">
        <NavRow
          href="/owner/payments"
          icon={<ClipboardCheck className="size-4" />}
          title="Verify payments"
          subtitle="Confirm receipts so bookings move to confirmed"
          right={pendingCount > 0 ? `${pendingCount} pending` : "Empty queue"}
        />
        <NavRow
          href="/owner/invoices"
          icon={<Receipt className="size-4" />}
          title="DinkHub invoices"
          subtitle="Weekly booking-fee invoices and payment history"
        />
        <NavRow
          href="/owner/venues"
          icon={<Layers className="size-4" />}
          title="Your venues"
          subtitle="Add venues, set GCash details, manage courts"
        />
      </ul>
    </Container>
  );
}

function NavRow({
  href,
  icon,
  title,
  subtitle,
  right,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  right?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-[var(--color-bg-subtle)]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-100)] text-[var(--color-brand-700)]">
            {icon}
          </span>
          <div className="min-w-0">
            <div className="font-semibold">{title}</div>
            <div className="truncate text-xs text-[var(--color-fg-muted)]">{subtitle}</div>
          </div>
        </div>
        {right && (
          <span className="shrink-0 text-xs font-semibold text-[var(--color-brand-700)]">{right} →</span>
        )}
      </Link>
    </li>
  );
}
