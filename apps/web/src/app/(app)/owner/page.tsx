import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Layers,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { formatPHP } from "@/lib/money";
import { listPendingPaymentsForOwner } from "@/features/bookings-view";
import { OwnerBalanceCard } from "@/features/owner-invoices/components/owner-balance-card";
import {
  getOwnerDashboardStats,
  getTodaysSchedule,
  getCourtUtilizationThisWeek,
  type ScheduleItem,
  type CourtUtilization,
} from "@/features/owner-dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner dashboard" };

// Time formatters — always display in Manila wall-clock regardless of server locale.
const TIME_FMT = new Intl.DateTimeFormat("en-PH", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Manila",
});

const TODAY_LABEL_FMT = new Intl.DateTimeFormat("en-PH", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Manila",
});

/**
 * Week-over-week percentage delta.
 * Returns null when there is no prior-week baseline (avoid division-by-zero
 * and a meaningless "+Infinity%" badge on new venues).
 */
function weekOverWeekPct(current: number | bigint, previous: number | bigint): number | null {
  const curr = typeof current === "bigint" ? Number(current) : current;
  const prev = typeof previous === "bigint" ? Number(previous) : previous;
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

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

  // All four fetches are independent — run in parallel.
  const [pending, stats, schedule, utilization] = await Promise.all([
    listPendingPaymentsForOwner(profile.id),
    getOwnerDashboardStats(profile.id),
    getTodaysSchedule(profile.id),
    getCourtUtilizationThisWeek(profile.id),
  ]);

  const pendingCount = pending.length;
  const firstName = profile.displayName.split(" ")[0] ?? profile.displayName;

  const grossDelta = weekOverWeekPct(stats.grossThisWeekCentavos, stats.grossLastWeekCentavos);
  const bookingsDelta = weekOverWeekPct(stats.bookingsThisWeek, stats.bookingsLastWeek);

  // Normalise court bar widths to the busiest court this week.
  const maxUtilMinutes = Math.max(...utilization.map((u) => u.bookedMinutes), 1);

  const todayLabel = TODAY_LABEL_FMT.format(new Date());

  return (
    <Container className="py-3 sm:py-4">
      <PageHeader
        kicker="Owner"
        title={`Hello, ${firstName}`}
        subtitle={
          pendingCount > 0
            ? `${pendingCount} payment${pendingCount === 1 ? "" : "s"} awaiting verification`
            : "All payments verified"
        }
        action={
          pendingCount > 0 ? (
            <Link href="/owner/payments" className={buttonVariants({ size: "sm" })}>
              Review {pendingCount}
            </Link>
          ) : undefined
        }
      />

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          title="Bookings today"
          value={stats.bookingsToday.toString()}
          subtitle={
            stats.bookingsToday === 0
              ? "None yet today"
              : `${formatPHP(stats.grossTodayCentavos)} gross`
          }
          icon={<CalendarClock className="size-4 text-[var(--color-brand-700)]" />}
        />
        <StatCard
          title="Gross today"
          value={formatPHP(stats.grossTodayCentavos)}
          subtitle="Confirmed only"
          icon={<Wallet className="size-4 text-[var(--color-brand-700)]" />}
        />
        <StatCard
          title="Bookings this week"
          value={stats.bookingsThisWeek.toString()}
          subtitle="Mon → now"
          delta={bookingsDelta}
          icon={<CalendarDays className="size-4 text-[var(--color-brand-700)]" />}
        />
        <StatCard
          title="Gross this week"
          value={formatPHP(stats.grossThisWeekCentavos)}
          subtitle="vs last week"
          delta={grossDelta}
          icon={<TrendingUp className="size-4 text-[var(--color-brand-700)]" />}
        />
      </div>

      {/* ── Today's schedule ────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionLabel className="mb-2 flex items-center gap-1.5">
          <CalendarClock className="size-3.5" />
          Today&apos;s schedule
          <span className="ml-1 font-normal text-[var(--color-fg-muted)]">· {todayLabel}</span>
        </SectionLabel>

        {schedule.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-6 text-center">
            <CalendarClock className="mx-auto size-8 text-[var(--color-fg-subtle)]" />
            <p className="mt-2 text-sm font-medium text-[var(--color-fg-muted)]">
              No confirmed bookings today
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
              Bookings appear here once players upload and you verify their payment receipt.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border-default)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)]">
            {schedule.map((item) => (
              <ScheduleRow key={item.bookingId} item={item} />
            ))}
          </ul>
        )}
      </section>

      {/* ── Court activity this week ─────────────────────────────────────── */}
      {utilization.length > 0 && (
        <section className="mt-6">
          <SectionLabel className="mb-2 block">Court activity this week</SectionLabel>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)]">
            <ul className="divide-y divide-[var(--color-border-default)]">
              {utilization.map((court) => (
                <CourtBar key={court.courtId} court={court} maxMinutes={maxUtilMinutes} />
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Outstanding invoice balance ──────────────────────────────────── */}
      <div className="mt-6">
        <OwnerBalanceCard ownerId={profile.id} />
      </div>

      {/* ── Quick-nav rows ───────────────────────────────────────────────── */}
      <ul className="mt-4 divide-y divide-[var(--color-border-default)]">
        <NavRow
          href="/owner/payments"
          icon={<ClipboardCheck className="size-4" />}
          title="Verify payments"
          subtitle="Confirm receipts so bookings move to confirmed"
          {...(pendingCount > 0 ? { right: `${pendingCount} pending` } : {})}
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

// ============================================================================
// Sub-components (co-located — no external consumers)
// ============================================================================

function WoWBadge({ delta }: { delta: number }) {
  const positive = delta >= 0;
  const sign = positive ? "+" : "";
  return (
    <span
      className={`shrink-0 text-[10px] font-bold tabular-nums ${
        positive ? "text-emerald-600" : "text-rose-600"
      }`}
    >
      {sign}
      {delta.toFixed(0)}% wk
    </span>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  delta,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  delta?: number | null;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-1">
        <span className="flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-100)]">
          {icon}
        </span>
        {delta != null && <WoWBadge delta={delta} />}
      </div>
      <div>
        <div className="text-xl font-bold tabular-nums leading-tight">{value}</div>
        <div className="mt-0.5 text-[11px] font-medium text-[var(--color-fg-muted)]">{title}</div>
        {subtitle && (
          <div className="mt-0.5 text-[10px] text-[var(--color-fg-subtle)]">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

function ScheduleRow({ item }: { item: ScheduleItem }) {
  const startLabel = TIME_FMT.format(item.startAt);
  const endLabel = TIME_FMT.format(item.endAt);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {/* Fixed-width time column keeps every row aligned */}
      <div className="w-[5.5rem] shrink-0 text-center">
        <div className="text-sm font-mono font-semibold tabular-nums">{startLabel}</div>
        <div className="text-[10px] text-[var(--color-fg-subtle)]">{endLabel}</div>
      </div>

      {/* Visual pip */}
      <div className="h-8 w-px shrink-0 rounded-full bg-[var(--color-brand-300)]" />

      {/* Court + venue + player */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="font-semibold leading-tight">{item.courtName}</span>
          <span className="text-xs text-[var(--color-fg-muted)]">· {item.venueName}</span>
        </div>
        <div className="mt-0.5 text-xs text-[var(--color-fg-muted)]">{item.playerDisplayName}</div>
      </div>

      {/* Amount */}
      <div className="shrink-0 text-sm font-semibold tabular-nums text-[var(--color-brand-700)]">
        {formatPHP(item.totalCentavos)}
      </div>
    </li>
  );
}

function CourtBar({
  court,
  maxMinutes,
}: {
  court: CourtUtilization;
  maxMinutes: number;
}) {
  const pct = maxMinutes > 0 ? Math.round((court.bookedMinutes / maxMinutes) * 100) : 0;
  const totalHours = Math.floor(court.bookedMinutes / 60);
  const remainMins = court.bookedMinutes % 60;
  const hoursLabel =
    court.bookedMinutes === 0
      ? "0h"
      : totalHours > 0
        ? remainMins > 0
          ? `${totalHours}h ${remainMins}m`
          : `${totalHours}h`
        : `${remainMins}m`;

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0">
          <span className="font-medium">{court.courtName}</span>
          <span className="ml-1.5 text-xs text-[var(--color-fg-muted)]">{court.venueName}</span>
        </div>
        <div className="shrink-0 text-right text-xs tabular-nums text-[var(--color-fg-muted)]">
          {hoursLabel}
          {" · "}
          {court.bookingCount} booking{court.bookingCount !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
        <div
          className={`h-full rounded-full ${
            court.bookedMinutes > 0
              ? "bg-[var(--color-brand-500)]"
              : "bg-[var(--color-border-default)]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
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
          <span className="shrink-0 text-xs font-semibold text-[var(--color-brand-700)]">
            {right} →
          </span>
        )}
      </Link>
    </li>
  );
}
