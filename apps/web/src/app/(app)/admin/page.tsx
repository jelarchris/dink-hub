import Link from "next/link";
import { ArrowRight, Building2, Clock, Users, Wallet } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPHP } from "@/lib/money";
import { formatDateTimeManila } from "@/lib/date";
import { getCurrentSystemFee, getDashboardStats } from "@/features/admin/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Dashboard" };

export default async function AdminDashboardPage() {
  const [stats, fee] = await Promise.all([getDashboardStats(), getCurrentSystemFee()]);

  return (
    <Container className="py-3 sm:py-4">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Admin dashboard</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">Last 7 days unless noted.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pending venues"
          value={stats.pendingVenues.toString()}
          subtitle="Awaiting your review"
          icon={<Clock className="size-5 text-orange-600" />}
          href="/admin/venues?status=pending_review"
          accent={stats.pendingVenues > 0 ? "warning" : "neutral"}
        />
        <StatCard
          title="Active venues"
          value={stats.activeVenues.toString()}
          subtitle="Live on the marketplace"
          icon={<Building2 className="size-5 text-[var(--color-brand-600)]" />}
          href="/admin/venues?status=active"
        />
        <StatCard
          title="Confirmed bookings"
          value={stats.bookingsLast7Days.toString()}
          subtitle={`${formatPHP(stats.grossLast7DaysCentavos)} gross`}
          icon={<Wallet className="size-5 text-[var(--color-brand-600)]" />}
          href="/admin/bookings?status=confirmed"
        />
        <StatCard
          title="Total users"
          value={stats.totalUsers.toString()}
          subtitle={`Fee accrued: ${formatPHP(stats.feeAccruedLast7DaysCentavos)}`}
          icon={<Users className="size-5 text-[var(--color-brand-600)]" />}
          href="/admin/users"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Pending venue approvals</h2>
              <Link
                href="/admin/venues?status=pending_review"
                className="inline-flex items-center gap-1 text-sm text-[var(--color-brand-700)] hover:underline"
              >
                View all <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {stats.recentPendingVenues.length === 0 ? (
              <EmptyState
                title="Inbox zero"
                description="No venues are waiting for review."
              />
            ) : (
              <ul className="divide-y divide-[var(--color-border-default)]">
                {stats.recentPendingVenues.map(({ venue, ownerEmail }) => (
                  <li key={venue.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{venue.name}</p>
                      <p className="truncate text-xs text-[var(--color-fg-muted)]">
                        {ownerEmail} · {venue.city} · submitted {formatDateTimeManila(venue.updatedAt)}
                      </p>
                    </div>
                    <Link href={`/admin/venues/${venue.id}`}>
                      <Button size="sm" variant="ghost">
                        Review <ArrowRight className="size-3.5" />
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-semibold">System fee</h2>
            <p className="text-3xl font-bold tracking-tight">
              {fee ? formatPHP(fee.feeAmountCentavos) : "—"}
            </p>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Snapshot to every new booking. Editing creates a new history row.
            </p>
            <Link href="/admin/system-fee" className="block">
              <Button variant="ghost" size="sm" className="w-full">
                Edit fee <ArrowRight className="size-3.5" />
              </Button>
            </Link>
            <hr className="border-[var(--color-border-default)]" />
            <div>
              <p className="text-sm font-medium">Pending payments</p>
              <p className="text-xs text-[var(--color-fg-muted)]">
                {stats.pendingPaymentBookings} booking{stats.pendingPaymentBookings === 1 ? "" : "s"}{" "}
                awaiting receipt
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Container>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  href,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  href: string;
  accent?: "warning" | "neutral";
}) {
  return (
    <Link href={href} className="block">
      <Card className="transition hover:border-[var(--color-brand-500)]">
        <CardContent className="space-y-2 pt-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
              {title}
            </p>
            {icon}
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {accent === "warning" && Number(value) > 0 && (
              <Badge variant="warning">action</Badge>
            )}
          </div>
          <p className="text-xs text-[var(--color-fg-muted)]">{subtitle}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
