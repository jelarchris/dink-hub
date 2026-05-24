import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  CreditCard,
  Layers,
  MapPin,
  MessageSquare,
  Receipt,
  Settings,
  Share2,
  ShieldCheck,
  Store,
  TrendingUp,
  Trophy,
  UserRound,
  Wallet,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { AutoRefresh } from "@/components/auto-refresh";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { formatPHP } from "@/lib/money";
import { listPendingPaymentsForOwner } from "@/features/bookings-view";
import { listVenuesForOwner, type OwnerVenueListItem } from "@/features/owner-venues/service";
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

const TIME_FMT = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Manila",
});

const COMPACT_TIME_FMT = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Manila",
});

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

function dayLabel(dayKey: string, todayKey: string, tomorrowKey: string): string {
  if (dayKey === todayKey) return "Today";
  if (dayKey === tomorrowKey) return "Tomorrow";
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

  const sp = await searchParams;
  const rawVenue = Array.isArray(sp.venue) ? sp.venue[0] : sp.venue;
  const venueIdFilter =
    rawVenue && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(rawVenue)
      ? rawVenue
      : undefined;

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

  const filteredPending = venueIdFilter
    ? pending.filter((item) => item.venue.id === venueIdFilter)
    : pending;
  const pendingCount = filteredPending.length;
  const pendingTotalCentavos = filteredPending.reduce(
    (total, item) => total + item.payment.amountCentavos,
    0n,
  );
  const firstName = profile.displayName.split(" ")[0] ?? profile.displayName;
  const grossDelta = weekOverWeekPct(stats.grossThisWeekCentavos, stats.grossLastWeekCentavos);
  const bookingsDelta = weekOverWeekPct(stats.bookingsThisWeek, stats.bookingsLastWeek);
  const monthDelta = weekOverWeekPct(stats.grossThisMonthCentavos, stats.grossLastMonthCentavos);

  const now = new Date();
  const todayKey = toManilaDayKey(now);
  const tomorrowKey = toManilaDayKey(new Date(now.getTime() + 86_400_000));
  const scheduleDays = groupByDay(schedule);
  const todayItems = schedule.filter((item) => item.manilaDateKey === todayKey);
  const nextBooking = schedule.find((item) => item.endAt > now) ?? schedule[0] ?? null;
  const maxUtilMinutes = Math.max(...utilization.map((u) => u.bookedMinutes), 1);

  const activeVenue = venueIdFilter
    ? venueList.find((v) => v.venue.id === venueIdFilter)?.venue
    : undefined;
  const visibleVenues = venueIdFilter
    ? venueList.filter((item) => item.venue.id === venueIdFilter)
    : venueList;
  const venueHealth = getVenueHealth(visibleVenues);
  const activeVenueCount = visibleVenues.filter((item) => item.venue.status === "active").length;
  const totalCourts = visibleVenues.reduce((total, item) => total + item.courtCount, 0);
  const showVenueFilter = venueList.length > 1;
  const hasActionItems = pendingCount > 0 || venueHealth.needsWork > 0 || stats.noShowsThisWeek > 0;

  const shareableVenues = visibleVenues.filter(
    (item) => item.venue.status === "active" && item.activeCourtCount > 0,
  );
  const shareHref =
    shareableVenues.length === 1 && shareableVenues[0]
      ? `/owner/venues/${shareableVenues[0].venue.id}/share`
      : "/owner/venues";

  return (
    <Container className="py-3 sm:py-4">
      <AutoRefresh intervalMs={15_000} />
      <PageHeader
        kicker="Owner"
        title={`Hi, ${firstName}`}
        subtitle={activeVenue ? activeVenue.name : `${activeVenueCount} active venue${activeVenueCount === 1 ? "" : "s"}`}
        action={
          pendingCount > 0 ? (
            <Link href="/owner/payments" className={buttonVariants({ size: "sm" })}>
              Review {pendingCount}
            </Link>
          ) : undefined
        }
      />

      {showVenueFilter && (
        <div className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <VenueTab href="/owner" label="All venues" active={!venueIdFilter} />
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

      {activeVenue && (
        <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
          Showing {activeVenue.name} only. {" "}
          <Link href="/owner" className="font-semibold text-[var(--color-brand-700)] underline-offset-4 hover:underline">
            Clear filter
          </Link>
        </p>
      )}

      <section className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <TodayPanel nextBooking={nextBooking} todayItems={todayItems} showVenue={!venueIdFilter && venueList.length > 1} />
        <ActionPanel
          pendingCount={pendingCount}
          pendingTotalCentavos={pendingTotalCentavos}
          venueHealth={venueHealth}
          noShowsThisWeek={stats.noShowsThisWeek}
          hasActionItems={hasActionItems}
        />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Bookings today"
          value={stats.bookingsToday.toString()}
          subtitle={stats.bookingsToday === 0 ? "No confirmed slots" : formatPHP(stats.grossTodayCentavos)}
          icon={<CalendarClock className="size-4 text-[var(--color-brand-700)]" />}
        />
        <StatCard
          title="This month"
          value={formatPHP(stats.grossThisMonthCentavos)}
          subtitle="Court fees confirmed"
          delta={monthDelta}
          icon={<Wallet className="size-4 text-[var(--color-brand-700)]" />}
        />
        <StatCard
          title="This week"
          value={stats.bookingsThisWeek.toString()}
          subtitle="Bookings"
          delta={bookingsDelta}
          icon={<CalendarDays className="size-4 text-[var(--color-brand-700)]" />}
        />
        <StatCard
          title="Weekly gross"
          value={formatPHP(stats.grossThisWeekCentavos)}
          subtitle="Court fees"
          delta={grossDelta}
          icon={<TrendingUp className="size-4 text-[var(--color-brand-700)]" />}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <SectionLabel className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" />
            Schedule
          </SectionLabel>
          {scheduleDays.size === 0 ? (
            <EmptyState
              icon={<CalendarClock className="size-8" />}
              title="No confirmed bookings"
              body="Confirmed bookings for the next 7 days will appear here."
            />
          ) : (
            <div className="space-y-3">
              {Array.from(scheduleDays.entries()).map(([dayKey, items]) => (
                <div key={dayKey}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
                      {dayLabel(dayKey, todayKey, tomorrowKey)}
                    </span>
                    <span className="text-xs text-[var(--color-fg-subtle)]">
                      {items.length} booking{items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="divide-y divide-[var(--color-border-default)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] shadow-[var(--shadow-sm)]">
                    {items.map((item) => (
                      <ScheduleRow
                        key={item.bookingId}
                        item={item}
                        showVenue={!venueIdFilter && venueList.length > 1}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 text-right">
            <Link
              href="/owner/bookings"
              className="text-xs font-semibold text-[var(--color-brand-700)] underline-offset-4 hover:underline"
            >
              View all bookings →
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <section>
            <SectionLabel className="flex items-center gap-1.5">
              <Banknote className="size-3.5" />
              Money
            </SectionLabel>
            <OwnerBalanceCard ownerId={profile.id} />
          </section>

          <section>
            <SectionLabel className="flex items-center gap-1.5">
              <Store className="size-3.5" />
              Venue health
            </SectionLabel>
            <VenueHealthPanel
              venueHealth={venueHealth}
              activeVenueCount={activeVenueCount}
              totalVenueCount={visibleVenues.length}
              totalCourts={totalCourts}
            />
          </section>
        </div>
      </section>

      {utilization.length > 0 && (
        <section className="mt-6">
          <SectionLabel className="flex items-center gap-1.5">
            <Layers className="size-3.5" />
            Court activity
          </SectionLabel>
          <ul className="divide-y divide-[var(--color-border-default)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] shadow-[var(--shadow-sm)]">
            {utilization.map((court) => (
              <CourtBar
                key={court.courtId}
                court={court}
                maxMinutes={maxUtilMinutes}
                showVenue={!venueIdFilter && venueList.length > 1}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <SectionLabel className="flex items-center gap-1.5">
          <Settings className="size-3.5" />
          Manage
        </SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction
            href="/owner/bookings?view=grid"
            icon={<CalendarDays className="size-4" />}
            title="Schedule"
            subtitle="Hourly grid by court"
          />
          <QuickAction
            href="/owner/payments"
            icon={<ClipboardCheck className="size-4" />}
            title="Payments"
            subtitle="Verify receipts"
            badge={pendingCount > 0 ? `${pendingCount} pending` : undefined}
          />
          <QuickAction
            href="/owner/venues"
            icon={<Layers className="size-4" />}
            title="Venues"
            subtitle="Courts, hours, GCash"
            badge={venueHealth.needsWork > 0 ? `${venueHealth.needsWork} to fix` : undefined}
          />
          {shareableVenues.length > 0 && (
            <QuickAction
              href={shareHref}
              icon={<Share2 className="size-4" />}
              title="Share availability"
              subtitle={
                shareableVenues.length === 1
                  ? "Post a branded poster"
                  : `Pick from ${shareableVenues.length} venues`
              }
            />
          )}
          <QuickAction
            href="/owner/open-play"
            icon={<Trophy className="size-4" />}
            title="Open Play"
            subtitle="Drop-in sessions"
          />
          <QuickAction
            href="/owner/invoices"
            icon={<Receipt className="size-4" />}
            title="Invoices"
            subtitle="Weekly DinkHub fees"
          />
          <QuickAction
            href="/owner/reviews"
            icon={<MessageSquare className="size-4" />}
            title="Reviews"
            subtitle="Player feedback"
          />
        </div>
      </section>
    </Container>
  );
}

function groupByDay(items: ScheduleItem[]): Map<string, ScheduleItem[]> {
  const map = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const existing = map.get(item.manilaDateKey);
    if (existing) existing.push(item);
    else map.set(item.manilaDateKey, [item]);
  }
  return map;
}

interface VenueHealthSummary {
  complete: number;
  needsWork: number;
  review: number;
  draft: number;
  suspended: number;
}

function getVenueHealth(items: OwnerVenueListItem[]): VenueHealthSummary {
  return items.reduce<VenueHealthSummary>(
    (summary, item) => {
      const { venue, courtCount } = item;
      const hasPaymentDetails = Boolean(venue.gcashAccountName && venue.gcashAccountNumber);
      const hasLocation = Boolean(venue.latitude && venue.longitude);
      const hasPublicDetails = Boolean(venue.description && (venue.coverImagePath || venue.coverImageUrl));
      const complete = venue.status === "active" && courtCount > 0 && hasPaymentDetails && hasLocation && hasPublicDetails;

      if (complete) summary.complete += 1;
      else summary.needsWork += 1;
      if (venue.status === "pending_review") summary.review += 1;
      if (venue.status === "draft" || venue.status === "rejected") summary.draft += 1;
      if (venue.status === "suspended") summary.suspended += 1;
      return summary;
    },
    { complete: 0, needsWork: 0, review: 0, draft: 0, suspended: 0 },
  );
}

function VenueTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-9 shrink-0 items-center rounded-full px-3 text-xs font-semibold transition active:scale-95 ${
        active
          ? "bg-[var(--color-brand-700)] text-white"
          : "bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] active:bg-[var(--color-bg-muted)]"
      }`}
    >
      {label}
    </Link>
  );
}

function TodayPanel({
  nextBooking,
  todayItems,
  showVenue,
}: {
  nextBooking: ScheduleItem | null;
  todayItems: ScheduleItem[];
  showVenue: boolean;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel className="mb-1 flex items-center gap-1.5">
            <Clock3 className="size-3.5" />
            Today
          </SectionLabel>
          <h2 className="text-lg font-bold tracking-tight">{todayItems.length} confirmed slot{todayItems.length === 1 ? "" : "s"}</h2>
        </div>
        <Link href="/owner/venues" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Manage
        </Link>
      </div>

      {nextBooking ? (
        <Link
          href={`/owner/bookings/${nextBooking.bookingId}`}
          className="mt-4 block rounded-[var(--radius-md)] border border-[var(--color-brand-200)] bg-[var(--color-brand-50)] p-4 transition active:scale-[0.98] hover:bg-[var(--color-brand-100)]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-brand-700)]">Next booking</p>
              <p className="mt-1 truncate text-base font-semibold text-[var(--color-brand-950)]">
                {nextBooking.courtName}
                {showVenue ? ` - ${nextBooking.venueName}` : ""}
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-brand-900)]">
                {TIME_FMT.format(nextBooking.startAt)} to {TIME_FMT.format(nextBooking.endAt)} - {nextBooking.playerDisplayName}
              </p>
            </div>
            <ArrowRight className="size-5 shrink-0 text-[var(--color-brand-700)]" />
          </div>
        </Link>
      ) : (
        <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-4">
          <p className="text-sm font-semibold">No upcoming confirmed bookings</p>
          <p className="mt-1 text-xs text-[var(--color-fg-muted)]">Verified player bookings will appear here.</p>
        </div>
      )}

      {todayItems.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {todayItems.slice(0, 4).map((item) => (
            <Link
              key={item.bookingId}
              href={`/owner/bookings/${item.bookingId}`}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-3 py-2.5 text-sm transition active:scale-[0.97] hover:bg-[var(--color-bg-muted)]"
            >
              <span className="block text-xs font-semibold tabular-nums">
                {COMPACT_TIME_FMT.format(item.startAt)}
                <span className="mx-0.5 text-[var(--color-fg-subtle)]">–</span>
                {COMPACT_TIME_FMT.format(item.endAt)}
              </span>
              <span className="mt-0.5 block truncate text-xs text-[var(--color-fg-muted)]">{item.courtName}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ActionPanel({
  pendingCount,
  pendingTotalCentavos,
  venueHealth,
  noShowsThisWeek,
  hasActionItems,
}: {
  pendingCount: number;
  pendingTotalCentavos: bigint;
  venueHealth: VenueHealthSummary;
  noShowsThisWeek: number;
  hasActionItems: boolean;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel className="mb-1 flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Action required
          </SectionLabel>
          <h2 className="text-lg font-bold tracking-tight">{hasActionItems ? "Needs attention" : "All clear"}</h2>
        </div>
        <span className={`flex size-9 items-center justify-center rounded-[var(--radius-md)] ${hasActionItems ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
          {hasActionItems ? <AlertCircle className="size-5" /> : <CheckCircle2 className="size-5" />}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <ActionItem
          href="/owner/payments"
          icon={<CreditCard className="size-4" />}
          title={pendingCount > 0 ? `${pendingCount} receipt${pendingCount === 1 ? "" : "s"} waiting` : "No payment queue"}
          subtitle={pendingCount > 0 ? `${formatPHP(pendingTotalCentavos)} to verify` : "Payments are current"}
          urgent={pendingCount > 0}
        />
        <ActionItem
          href="/owner/venues"
          icon={<MapPin className="size-4" />}
          title={venueHealth.needsWork > 0 ? `${venueHealth.needsWork} venue profile${venueHealth.needsWork === 1 ? "" : "s"} need work` : "Venue profiles ready"}
          subtitle={
            venueHealth.needsWork > 0
              ? "Check photos, map pin, courts, and GCash details"
              : venueHealth.review > 0
                ? `${venueHealth.review} waiting for admin review`
                : "Listings and payment details checked"
          }
          urgent={venueHealth.needsWork > 0}
        />
        <ActionItem
          href="/owner/bookings?status=no_show"
          icon={<UserRound className="size-4" />}
          title={noShowsThisWeek > 0 ? `${noShowsThisWeek} no-show${noShowsThisWeek === 1 ? "" : "s"} this week` : "No no-shows this week"}
          subtitle={noShowsThisWeek > 0 ? "Review player history" : "Player attendance is clean"}
          urgent={noShowsThisWeek > 0}
        />
      </div>
    </section>
  );
}

function ActionItem({
  href,
  icon,
  title,
  subtitle,
  urgent,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  urgent: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-3 py-2.5 transition active:scale-[0.98] hover:bg-[var(--color-bg-muted)]"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${urgent ? "bg-orange-100 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug">{title}</p>
          <p className="mt-0.5 text-xs leading-snug text-[var(--color-fg-muted)]">{subtitle}</p>
        </div>
      </div>
      <ArrowRight className="mt-2 size-4 shrink-0 text-[var(--color-fg-subtle)]" />
    </Link>
  );
}

function WoWBadge({ delta }: { delta: number }) {
  const positive = delta >= 0;
  const sign = positive ? "+" : "";
  return (
    <span className={`shrink-0 text-[10px] font-bold tabular-nums ${positive ? "text-emerald-600" : "text-rose-600"}`}>
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
    <div className="flex min-h-[7.5rem] min-w-0 flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-3 shadow-[var(--shadow-sm)] sm:min-h-[8.25rem] sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-100)]">
          {icon}
        </span>
        {delta != null && <WoWBadge delta={delta} />}
      </div>
      <div>
        <p className="break-words text-lg font-bold leading-tight tabular-nums sm:text-xl">{value}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-[var(--color-fg-muted)]">{title}</p>
        {subtitle && <p className="mt-0.5 text-[11px] text-[var(--color-fg-subtle)]">{subtitle}</p>}
      </div>
    </div>
  );
}

function ScheduleRow({ item, showVenue }: { item: ScheduleItem; showVenue: boolean }) {
  const startLabel = COMPACT_TIME_FMT.format(item.startAt);
  const endLabel = COMPACT_TIME_FMT.format(item.endAt);

  return (
    <li>
      <Link
        href={`/owner/bookings/${item.bookingId}`}
        className="flex items-center gap-3 px-3 py-3 transition active:scale-[0.99] hover:bg-[var(--color-bg-subtle)] sm:px-4"
      >
        <div className="w-[4.8rem] shrink-0 text-center">
          <div className="font-mono text-sm font-semibold tabular-nums">{startLabel}</div>
          <div className="text-[10px] text-[var(--color-fg-subtle)]">{endLabel}</div>
        </div>
        <div className="h-9 w-px shrink-0 rounded-full bg-[var(--color-brand-300)]" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight">{item.courtName}</div>
          <div className="mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">
            {item.playerDisplayName}
            {showVenue ? ` - ${item.venueName}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--color-brand-700)]">
          {formatPHP(item.totalCentavos)}
        </div>
      </Link>
    </li>
  );
}

function VenueHealthPanel({
  venueHealth,
  activeVenueCount,
  totalVenueCount,
  totalCourts,
}: {
  venueHealth: VenueHealthSummary;
  activeVenueCount: number;
  totalVenueCount: number;
  totalCourts: number;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-3 shadow-[var(--shadow-sm)] sm:p-4">
      <div className="grid grid-cols-3 gap-1.5 text-center sm:gap-2">
        <MiniMetric label="Active" value={activeVenueCount.toString()} />
        <MiniMetric label="Courts" value={totalCourts.toString()} />
        <MiniMetric label="Ready" value={venueHealth.complete.toString()} />
      </div>
      <div className="mt-4 space-y-2 text-sm leading-snug">
        <HealthLine label="Complete profiles" value={`${venueHealth.complete}/${totalVenueCount}`} healthy={venueHealth.needsWork === 0} />
        <HealthLine label="Waiting review" value={venueHealth.review.toString()} healthy={venueHealth.review === 0} />
        <HealthLine label="Draft or rejected" value={venueHealth.draft.toString()} healthy={venueHealth.draft === 0} />
        <HealthLine label="Suspended" value={venueHealth.suspended.toString()} healthy={venueHealth.suspended === 0} />
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] px-1.5 py-2 sm:px-2">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</p>
    </div>
  );
}

function HealthLine({ label, value, healthy }: { label: string; value: string; healthy: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--color-fg-muted)]">{label}</span>
      <span className={`font-semibold tabular-nums ${healthy ? "text-emerald-600" : "text-orange-700"}`}>{value}</span>
    </div>
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
          {showVenue && <span className="ml-1.5 text-xs text-[var(--color-fg-muted)]">{court.venueName}</span>}
        </div>
        <div className="shrink-0 text-right text-xs tabular-nums text-[var(--color-fg-muted)]">
          {hoursLabel} - {court.bookingCount} booking{court.bookingCount === 1 ? "" : "s"}
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
        <div
          className={court.bookedMinutes > 0 ? "h-full rounded-full bg-[var(--color-brand-500)]" : "h-full rounded-full bg-[var(--color-border-default)]"}
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
  );
}

function QuickAction({
  href,
  icon,
  title,
  subtitle,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string | undefined;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[5.5rem] items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-3 shadow-[var(--shadow-sm)] transition active:scale-[0.98] hover:bg-[var(--color-bg-subtle)] sm:items-center sm:p-4"
    >
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-100)] text-[var(--color-brand-700)]">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{title}</p>
          <p className="text-xs leading-snug text-[var(--color-fg-muted)]">{subtitle}</p>
          {badge && <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-orange-700">{badge}</p>}
        </div>
      </div>
      <ArrowRight className="size-4 shrink-0 text-[var(--color-fg-subtle)]" />
    </Link>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-6 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg)] text-[var(--color-fg-subtle)]">
        {icon}
      </div>
      <p className="mt-3 text-sm font-semibold text-[var(--color-fg-muted)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{body}</p>
    </div>
  );
}
