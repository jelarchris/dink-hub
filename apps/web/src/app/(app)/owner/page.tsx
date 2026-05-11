import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Layers,
  MessageSquare,
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
import { listVenuesForOwner } from "@/features/owner-venues/service";
import { OwnerBalanceCard } from "@/features/owner-invoices/components/owner-balance-card";
import {
  getOwnerDashboardStats,
  getUpcomingSchedule,
  getCourtUtilizationThisWeek,
  toManilaDayKey,
  type ScheduleItem,
  type CourtUtilization,
} from "@/features/owner-dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner dashboard" };

// Time formatter — always display in Manila wall-clock regardless of server locale.
const TIME_FMT = new Intl.DateTimeFormat("en-PH", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Manila",
});

// Short day header: "Mon, May 12"
const DAY_HEADER_FMT = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "Asia/Manila",
});

function weekOverWeekPct(current: number | bigint, previous: number | bigint): number | null {
  const curr = typeof current === "bigint" ? Number(current) : current;
  const prev = typeof previous === "bigint" ? Number(previous) : previous;
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

/**
 * Human-readable label for a schedule day section header.
 * "Today", "Tomorrow", or short date string.
 */
function dayLabel(dayKey: string, todayKey: string, tomorrowKey: string): string {
  if (dayKey === todayKey) return "Today";
  if (dayKey === tomorrowKey) return "Tomorrow";
  // Parse the key as a UTC midnight date for the formatter — then Manila tz
  // will display it exactly as that calendar date (no off-by-one).
  return DAY_HEADER_FMT.format(new Date(`${dayKey}T00:00:00+08:00`));
}

export default async function OwnerDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  // Resolve venue filter from URL — absent or "all" means no filter.
  const sp = await searchParams;
  const rawVenue = Array.isArray(sp.venue) ? sp.venue[0] : sp.venue;
  // Only trust a UUID-shaped value to prevent injection into queries.
  const venueIdFilter =
    rawVenue && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(rawVenue)
      ? rawVenue
      : undefined;

  // All independent fetches run in parallel.
  const [pending, venueList, stats, schedule, utilization] = await Promise.all([
    listPendingPaymentsForOwner(profile.id),
    listVenuesForOwner(profile.id),
    getOwnerDashboardStats(profile.id, venueIdFilter),
    getUpcomingSchedule(profile.id, {
      ...(venueIdFilter ? { venueId: venueIdFilter } : {}),
      days: 7,
    }),
    getCourtUtilizationThisWeek(profile.id, venueIdFilter),
  ]);

  const pendingCount = pending.length;
  const firstName = profile.displayName.split(" ")[0] ?? profile.displayName;

  const grossDelta = weekOverWeekPct(stats.grossThisWeekCentavos, stats.grossLastWeekCentavos);
  const bookingsDelta = weekOverWeekPct(stats.bookingsThisWeek, stats.bookingsLastWeek);

  const maxUtilMinutes = Math.max(...utilization.map((u) => u.bookedMinutes), 1);

  // Group schedule items by Manila date key — preserves chronological order within each day.
  const now = new Date();
  const todayKey = toManilaDayKey(now);
  const tomorrowKey = toManilaDayKey(new Date(now.getTime() + 86_400_000));
  const scheduleDays = groupByDay(schedule);

  // Determine the active venue label for the filter bar.
  const activeVenue = venueIdFilter
    ? venueList.find((v) => v.venue.id === venueIdFilter)?.venue
    : undefined;

  const showVenueFilter = venueList.length > 1;

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

      {/* ── Venue filter ─────────────────────────────────────────────────── */}
      {showVenueFilter && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <VenueTab
            href="/owner"
            label="All venues"
            active={!venueIdFilter}
          />
          {venueList.map(({ venue }) => (
            <VenueTab
              key={venue.id}
              href={`/owner?venue=${venue.id}`}
              label={venue.name}
              active={venueIdFilter === venue.id}
            />
          ))}
        </div>
      )}

      {/* Active-venue context hint */}
      {activeVenue && (
        <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
          Showing data for <strong>{activeVenue.name}</strong> only ·{" "}
          <Link href="/owner" className="underline hover:text-[var(--color-fg)]">
            Clear filter
          </Link>
        </p>
      )}

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

      {/* ── No-show row ─────────────────────────────────────────────────── */}
      {stats.noShowsThisWeek > 0 && (
        <div className="mt-3">
          <StatCard
            title="No-shows this week"
            value={stats.noShowsThisWeek.toString()}
            subtitle="Confirmed bookings where player didn't show"
            accent="rose"
            icon={<AlertCircle className="size-4 text-rose-600" />}
          />
        </div>
      )}

      {/* ── Upcoming schedule ────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionLabel className="mb-2 flex items-center gap-1.5">
          <CalendarClock className="size-3.5" />
          Upcoming bookings
          <span className="ml-1 font-normal text-[var(--color-fg-muted)]">· next 7 days</span>
        </SectionLabel>

        {scheduleDays.size === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-6 text-center">
            <CalendarClock className="mx-auto size-8 text-[var(--color-fg-subtle)]" />
            <p className="mt-2 text-sm font-medium text-[var(--color-fg-muted)]">
              No confirmed bookings in the next 7 days
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
              Bookings appear here once players upload and you verify their payment receipt.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from(scheduleDays.entries()).map(([dayKey, items]) => (
              <div key={dayKey}>
                {/* Day header */}
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--color-fg-muted)] uppercase tracking-wide">
                    {dayLabel(dayKey, todayKey, tomorrowKey)}
                  </span>
                  <span className="text-[10px] text-[var(--color-fg-subtle)]">
                    · {items.length} booking{items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <ul className="divide-y divide-[var(--color-border-default)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)]">
                  {items.map((item) => (
                    <ScheduleRow key={item.bookingId} item={item} showVenue={!venueIdFilter && venueList.length > 1} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Court activity this week ─────────────────────────────────────── */}
      {utilization.length > 0 && (
        <section className="mt-6">
          <SectionLabel className="mb-2 block">Court activity this week</SectionLabel>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)]">
            <ul className="divide-y divide-[var(--color-border-default)]">
              {utilization.map((court) => (
                <CourtBar key={court.courtId} court={court} maxMinutes={maxUtilMinutes} showVenue={!venueIdFilter && venueList.length > 1} />
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
        <NavRow
          href="/owner/reviews"
          icon={<MessageSquare className="size-4" />}
          title="Reviews"
          subtitle="See player reviews and reply to feedback"
        />
      </ul>
    </Container>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Group schedule items into an ordered Map keyed by manilaDateKey.
 * Insertion order == chronological order because items arrive sorted from DB.
 */
function groupByDay(items: ScheduleItem[]): Map<string, ScheduleItem[]> {
  const map = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const existing = map.get(item.manilaDateKey);
    if (existing) {
      existing.push(item);
    } else {
      map.set(item.manilaDateKey, [item]);
    }
  }
  return map;
}

// ============================================================================
// Sub-components (co-located — no external consumers)
// ============================================================================

function VenueTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? "bg-[var(--color-brand-700)] text-white"
          : "bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]"
      }`}
    >
      {label}
    </Link>
  );
}

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
  accent,
}: {
  title: string;
  value: string;
  subtitle?: string;
  delta?: number | null;
  icon: React.ReactNode;
  accent?: "rose";
}) {
  const accentClass = accent === "rose" ? "bg-rose-50" : "bg-[var(--color-brand-100)]";
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-1">
        <span className={`flex size-9 items-center justify-center rounded-[var(--radius-md)] ${accentClass}`}>
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

function ScheduleRow({
  item,
  showVenue,
}: {
  item: ScheduleItem;
  showVenue: boolean;
}) {
  const startLabel = TIME_FMT.format(item.startAt);
  const endLabel = TIME_FMT.format(item.endAt);

  return (
    <li>
      <Link
        href={`/owner/bookings/${item.bookingId}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-bg-subtle)]"
      >
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
            {showVenue && (
              <span className="text-xs text-[var(--color-fg-muted)]">· {item.venueName}</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
            {item.playerDisplayName}
          </div>
        </div>

        {/* Amount */}
        <div className="shrink-0 text-sm font-semibold tabular-nums text-[var(--color-brand-700)]">
          {formatPHP(item.totalCentavos)}
        </div>
      </Link>
    </li>
  );
}

function CourtBar({
  court,
  maxMinutes,
  showVenue,
}: {
  court: CourtUtilization;
  maxMinutes: number;
  showVenue: boolean;
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
          {showVenue && (
            <span className="ml-1.5 text-xs text-[var(--color-fg-muted)]">{court.venueName}</span>
          )}
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
