import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronRight, LayoutGrid, List, Mail, Phone } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  getOwnerGridData,
  listBookingsForOwner,
  type OwnerBookingListItem,
  type OwnerBookingStatusFilter,
  type OwnerGridBooking,
  type OwnerGridClosure,
  type OwnerGridCourt,
} from "@/features/bookings-view";
import { listVenuesForOwner, listVenuesWithActiveCourtsForOwner } from "@/features/owner-venues/service";
import {
  formatDateLongManila,
  formatTimeManila,
  fromManilaWallClock,
  generateDaySlotsManila,
  manilaCalendarParts,
  manilaUpcomingDays,
} from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { Booking } from "@/db/schema";
import { NavChip } from "./nav-chip";
import { CloseVenueLauncher } from "./close-venue-launcher";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings schedule" };

const STATUS_TABS: { key: OwnerBookingStatusFilter; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All" },
  { key: "confirmed", label: "Confirmed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "no_show", label: "No-show" },
  { key: "expired", label: "Expired" },
  { key: "refunded", label: "Refunded" },
];

const VALID_STATUS_KEYS = new Set<string>(STATUS_TABS.map((t) => t.key));

type ViewMode = "agenda" | "grid";

function makeUrl(
  status: OwnerBookingStatusFilter,
  venueId: string | undefined,
  cursor: string | undefined,
): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (venueId) params.set("venue", venueId);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return `/owner/bookings${qs ? `?${qs}` : ""}`;
}

function makeGridUrl(args: {
  venueId?: string | undefined;
  courtId?: string | undefined;
  dateIso?: string | undefined;
}): string {
  const params = new URLSearchParams();
  params.set("view", "grid");
  if (args.venueId) params.set("venue", args.venueId);
  if (args.courtId) params.set("court", args.courtId);
  if (args.dateIso) params.set("date", args.dateIso);
  return `/owner/bookings?${params.toString()}`;
}

/** Manila YYYY-MM-DD day key. */
function manilaDayKey(d: Date): string {
  const p = manilaCalendarParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Friendly day header: "Today", "Tomorrow", "Yesterday", or full date. */
function dayHeaderLabel(
  d: Date,
  todayKey: string,
  tomorrowKey: string,
  yesterdayKey: string,
): string {
  const key = manilaDayKey(d);
  const long = formatDateLongManila(d);
  if (key === todayKey) return `Today · ${long}`;
  if (key === tomorrowKey) return `Tomorrow · ${long}`;
  if (key === yesterdayKey) return `Yesterday · ${long}`;
  return long;
}

interface DayGroup {
  key: string;
  label: string;
  items: OwnerBookingListItem[];
}

function groupByManilaDay(items: OwnerBookingListItem[]): DayGroup[] {
  const now = new Date();
  const todayKey = manilaDayKey(now);
  const tomorrowKey = manilaDayKey(new Date(now.getTime() + 24 * 3600_000));
  const yesterdayKey = manilaDayKey(new Date(now.getTime() - 24 * 3600_000));
  const groups: DayGroup[] = [];
  for (const item of items) {
    const key = manilaDayKey(item.booking.startAt);
    const existing = groups.find((g) => g.key === key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({
        key,
        label: dayHeaderLabel(item.booking.startAt, todayKey, tomorrowKey, yesterdayKey),
        items: [item],
      });
    }
  }
  return groups;
}

export default async function OwnerBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent("/owner/bookings")}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") redirect("/owner");

  const sp = await searchParams;
  const rawView = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const rawStatus = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const rawVenue = Array.isArray(sp.venue) ? sp.venue[0] : sp.venue;
  const rawCursor = Array.isArray(sp.cursor) ? sp.cursor[0] : sp.cursor;
  const rawCourt = Array.isArray(sp.court) ? sp.court[0] : sp.court;
  const rawDate = Array.isArray(sp.date) ? sp.date[0] : sp.date;

  const view: ViewMode = rawView === "grid" ? "grid" : "agenda";

  const statusFilter: OwnerBookingStatusFilter =
    rawStatus && VALID_STATUS_KEYS.has(rawStatus)
      ? (rawStatus as OwnerBookingStatusFilter)
      : "all";

  const uuidRe = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  const venueId = rawVenue && uuidRe.test(rawVenue) ? rawVenue : undefined;
  const courtIdParam = rawCourt && uuidRe.test(rawCourt) ? rawCourt : undefined;
  const dateParam = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined;

  const cursor = rawCursor ?? undefined;

  const venueList = await listVenuesForOwner(profile.id);
  const venuesWithCourts = await listVenuesWithActiveCourtsForOwner(profile.id);

  if (view === "grid") {
    return renderGridView({
      profileId: profile.id,
      venueList,
      venuesWithCourts,
      requestedVenueId: venueId,
      requestedCourtId: courtIdParam,
      requestedDateIso: dateParam,
    });
  }

  const { items, nextCursor } = await listBookingsForOwner({
    ownerId: profile.id,
    statusFilter,
    ...(venueId !== undefined ? { venueId } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
  });

  const showVenueFilter = venueList.length > 1;
  const groups = groupByManilaDay(items);

  return (
    <Container className="py-3 sm:py-4">
      <PageHeader
        kicker="Owner"
        title="Bookings schedule"
        subtitle="Every confirmed booking, grouped by day"
        action={
          <div className="flex items-center gap-2">
            {venuesWithCourts.length > 0 && (
              <CloseVenueLauncher
                key={`agenda-${venueId ?? "all"}`}
                venues={venuesWithCourts}
                {...(venueId ? { defaultVenueId: venueId } : {})}
              />
            )}
            <Link href="/owner" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Dashboard
            </Link>
          </div>
        }
      />

      {/* View toggle: Agenda ↔ Grid */}
      <ViewToggle
        currentView="agenda"
        agendaHref={makeUrl(statusFilter, venueId, undefined)}
        gridHref={makeGridUrl({ venueId: venueId ?? venueList[0]?.venue.id })}
      />

      {/* Status tabs */}
      <div className="-mx-3 mt-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={makeUrl(tab.key, venueId, undefined)}
            className={`inline-flex h-9 shrink-0 items-center rounded-full px-3 text-xs font-semibold transition active:scale-95 ${
              statusFilter === tab.key
                ? "bg-[var(--color-brand-700)] text-white"
                : "bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] active:bg-[var(--color-bg-muted)]"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Venue filter — only shown when owner has multiple venues */}
      {showVenueFilter && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Link
            href={makeUrl(statusFilter, undefined, undefined)}
            className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold transition-colors ${
              !venueId
                ? "bg-[var(--color-fg)] text-[var(--color-bg)]"
                : "bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)]"
            }`}
          >
            All venues
          </Link>
          {venueList.map(({ venue }) => (
            <Link
              key={venue.id}
              href={makeUrl(statusFilter, venue.id, undefined)}
              className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold transition-colors ${
                venueId === venue.id
                  ? "bg-[var(--color-fg)] text-[var(--color-bg)]"
                  : "bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)]"
              }`}
            >
              {venue.name}
            </Link>
          ))}
        </div>
      )}

      {/* Day-grouped agenda */}
      {groups.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title="No bookings found"
          description={
            statusFilter === "all"
              ? "Bookings will appear here once players start booking your courts."
              : "No bookings with this filter."
          }
          action={
            statusFilter !== "all" ? (
              <Link href="/owner/bookings" className={buttonVariants({ variant: "outline" })}>
                View all
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="mt-4 space-y-4">
            {groups.map((group) => (
              <section key={group.key}>
                <header className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-[var(--radius-md)] border border-b-0 border-[var(--color-border-default)] bg-[var(--color-bg)]/95 px-3 py-1.5 backdrop-blur">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
                    {group.label}
                  </h2>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-fg-subtle)]">
                    {group.items.length} booking{group.items.length === 1 ? "" : "s"}
                  </span>
                </header>
                <ul className="divide-y divide-[var(--color-border-default)] rounded-b-[var(--radius-lg)] border-x border-b border-[var(--color-border-default)] bg-[var(--color-bg)] shadow-[var(--shadow-sm)]">
                  {group.items.map((item) => (
                    <BookingRow
                      key={item.booking.id}
                      item={item}
                      showVenue={showVenueFilter && !venueId}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-[var(--color-fg-muted)]">
              {items.length} booking{items.length === 1 ? "" : "s"}
              {cursor ? " · more above" : ""}
            </p>
            <div className="flex gap-2">
              {cursor && (
                <Link
                  href={makeUrl(statusFilter, venueId, undefined)}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  ← First page
                </Link>
              )}
              {nextCursor && (
                <Link
                  href={makeUrl(statusFilter, venueId, nextCursor)}
                  className={buttonVariants({ size: "sm" })}
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </Container>
  );
}

function BookingRow({
  item,
  showVenue,
}: {
  item: OwnerBookingListItem;
  showVenue: boolean;
}) {
  const phone = item.player.phoneE164;
  const email = item.player.email;
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        <div className="flex w-16 shrink-0 flex-col items-center rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] px-1 py-1.5 text-center">
          <span className="text-[11px] font-bold leading-tight text-[var(--color-brand-700)]">
            {formatTimeManila(item.booking.startAt)}
          </span>
          <span className="text-[9px] uppercase text-[var(--color-fg-subtle)]">to</span>
          <span className="text-[11px] font-bold leading-tight text-[var(--color-fg)]">
            {formatTimeManila(item.booking.endAt)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/owner/bookings/${item.booking.id}`}
            className="group flex items-center gap-1.5"
          >
            <span className="truncate font-semibold text-[var(--color-fg)] group-hover:text-[var(--color-brand-700)]">
              {item.playerDisplayName}
            </span>
            <BookingStatusBadge status={item.booking.status} />
            <ChevronRight className="ml-auto size-4 shrink-0 text-[var(--color-fg-subtle)]" />
          </Link>
          <p className="mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">
            {showVenue ? `${item.venue.name} · ` : ""}
            {item.court.name} · {formatPHP(item.booking.totalCentavos)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {phone && (
              <a
                href={`tel:${phone}`}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)] active:bg-[var(--color-bg-muted)]"
              >
                <Phone className="size-3" />
                {phone}
              </a>
            )}
            <a
              href={`mailto:${email}`}
              className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-[var(--color-bg-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)] active:bg-[var(--color-bg-muted)]"
            >
              <Mail className="size-3 shrink-0" />
              <span className="truncate">{email}</span>
            </a>
          </div>
        </div>
      </div>
    </li>
  );
}

function BookingStatusBadge({ status }: { status: Booking["status"] }) {
  const variants: Record<
    Booking["status"],
    { label: string; variant: "success" | "warning" | "info" | "danger" | "neutral" }
  > = {
    pending_payment: { label: "Pending payment", variant: "warning" },
    payment_submitted: { label: "Receipt submitted", variant: "warning" },
    confirmed: { label: "Confirmed", variant: "success" },
    cancelled: { label: "Cancelled", variant: "danger" },
    no_show: { label: "No-show", variant: "danger" },
    expired: { label: "Expired", variant: "neutral" },
    refunded: { label: "Refunded", variant: "neutral" },
    open_play: { label: "Open Play", variant: "info" },
  };
  const { label, variant } = variants[status];
  return <Badge variant={variant}>{label}</Badge>;
}

// ============================================================================
// Grid view (date strip + hourly tiles per court)
// ============================================================================

function ViewToggle({
  currentView,
  agendaHref,
  gridHref,
}: {
  currentView: ViewMode;
  agendaHref: string;
  gridHref: string;
}) {
  const base =
    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition active:scale-95";
  const active = "bg-[var(--color-fg)] text-[var(--color-bg)]";
  const inactive =
    "bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]";
  return (
    <div className="mt-3 inline-flex rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg)] p-0.5">
      <NavChip
        href={agendaHref}
        active={currentView === "agenda"}
        className={base}
        activeClassName={active}
        inactiveClassName={inactive}
      >
        <List className="size-3.5" />
        Agenda
      </NavChip>
      <NavChip
        href={gridHref}
        active={currentView === "grid"}
        className={base}
        activeClassName={active}
        inactiveClassName={inactive}
      >
        <LayoutGrid className="size-3.5" />
        Grid
      </NavChip>
    </div>
  );
}

async function renderGridView(args: {
  profileId: string;
  venueList: Awaited<ReturnType<typeof listVenuesForOwner>>;
  venuesWithCourts: Awaited<ReturnType<typeof listVenuesWithActiveCourtsForOwner>>;
  requestedVenueId: string | undefined;
  requestedCourtId: string | undefined;
  requestedDateIso: string | undefined;
}) {
  const { profileId, venueList, venuesWithCourts, requestedVenueId, requestedCourtId, requestedDateIso } = args;

  // No venues at all → empty state.
  if (venueList.length === 0) {
    return (
      <Container className="py-3 sm:py-4">
        <PageHeader
          kicker="Owner"
          title="Bookings schedule"
          subtitle="Per-court hourly grid"
          action={
            <Link href="/owner" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Dashboard
            </Link>
          }
        />
        <ViewToggle
          currentView="grid"
          agendaHref="/owner/bookings"
          gridHref={makeGridUrl({})}
        />
        <EmptyState
          icon={<LayoutGrid />}
          title="No venues yet"
          description="List a venue first to see its grid."
          action={
            <Link href="/owner/venues" className={buttonVariants({ variant: "outline" })}>
              Go to Venues
            </Link>
          }
        />
      </Container>
    );
  }

  // Default to the first owned venue if not specified.
  const venueId =
    requestedVenueId && venueList.some((v) => v.venue.id === requestedVenueId)
      ? requestedVenueId
      : venueList[0]!.venue.id;

  // Default to today (Manila) if not specified.
  const days = manilaUpcomingDays(14);
  const todayIso = days[0]!.isoDate;
  const selectedDateIso =
    requestedDateIso && days.some((d) => d.isoDate === requestedDateIso)
      ? requestedDateIso
      : todayIso;
  const selectedDay = days.find((d) => d.isoDate === selectedDateIso)!;

  // Manila day window in UTC for the DB query.
  const [y, m, d] = selectedDateIso.split("-").map(Number) as [number, number, number];
  const dayStartUtc = fromManilaWallClock(y, m, d, 0, 0);
  const dayEndUtc = fromManilaWallClock(y, m, d + 1, 0, 0);

  const gridData = await getOwnerGridData({
    ownerId: profileId,
    venueId,
    ...(requestedCourtId !== undefined ? { courtId: requestedCourtId } : {}),
    dayStartUtc,
    dayEndUtc,
  });

  if (!gridData) {
    // Venue not owned (shouldn't reach here — venueList filtered above).
    redirect("/owner/bookings");
  }

  if (gridData.courts.length === 0) {
    return (
      <Container className="py-3 sm:py-4">
        <PageHeader
          kicker="Owner"
          title="Bookings schedule"
          subtitle={`${gridData.venue.name} · no active courts`}
          action={
            <Link href="/owner" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Dashboard
            </Link>
          }
        />
        <ViewToggle
          currentView="grid"
          agendaHref={makeUrl("all", venueId, undefined)}
          gridHref={makeGridUrl({ venueId })}
        />
        <VenueTabs venueList={venueList} selectedVenueId={venueId} />
        <EmptyState
          icon={<LayoutGrid />}
          title="No active courts"
          description="Add a court to this venue to start accepting bookings."
          action={
            <Link
              href={`/owner/venues/${venueId}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Manage venue
            </Link>
          }
        />
      </Container>
    );
  }

  const selectedCourtId =
    requestedCourtId && gridData.courts.some((c) => c.id === requestedCourtId)
      ? requestedCourtId
      : gridData.courts[0]!.id;
  const selectedCourt = gridData.courts.find((c) => c.id === selectedCourtId)!;

  return (
    <Container className="py-3 sm:py-4">
      <PageHeader
        kicker="Owner"
        title="Bookings schedule"
        subtitle={`${gridData.venue.name} · ${formatDateLongManila(selectedDay.manilaMidnightUtc)}`}
        action={
          <div className="flex items-center gap-2">
            {venuesWithCourts.length > 0 && (
              <CloseVenueLauncher
                key={`grid-${venueId}-${selectedCourtId}`}
                venues={venuesWithCourts}
                defaultVenueId={venueId}
                defaultCourtId={selectedCourtId}
              />
            )}
            <Link href="/owner" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Dashboard
            </Link>
          </div>
        }
      />

      <ViewToggle
        currentView="grid"
        agendaHref={makeUrl("all", venueId, undefined)}
        gridHref={makeGridUrl({ venueId, courtId: selectedCourtId, dateIso: selectedDateIso })}
      />

      <VenueTabs venueList={venueList} selectedVenueId={venueId} />

      {/* Date strip */}
      <section className="mt-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
          Select date
        </h2>
        <div className="-mx-3 mt-1.5 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
          {days.map((day) => (
            <DateChip
              key={day.isoDate}
              isoDate={day.isoDate}
              dayLabel={day.label}
              dateLabel={formatDateChipParts(day.manilaMidnightUtc)}
              isToday={day.isToday}
              selected={day.isoDate === selectedDateIso}
              href={makeGridUrl({
                venueId,
                courtId: selectedCourtId,
                dateIso: day.isoDate,
              })}
            />
          ))}
        </div>
      </section>

      {/* Court tabs */}
      {gridData.courts.length > 1 && (
        <section className="mt-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
            Court
          </h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {gridData.courts.map((c) => (
              <NavChip
                key={c.id}
                href={makeGridUrl({
                  venueId,
                  courtId: c.id,
                  dateIso: selectedDateIso,
                })}
                active={c.id === selectedCourtId}
                className="inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition active:scale-95"
                activeClassName="bg-[var(--color-brand-700)] text-white"
                inactiveClassName="bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)]"
              >
                {c.name}
              </NavChip>
            ))}
          </div>
        </section>
      )}

      {/* Hourly tile grid */}
      <CourtDayGrid
        court={selectedCourt}
        dateIso={selectedDateIso}
        bookings={gridData.bookings}
        closures={gridData.closures}
        nowMs={Date.now()}
      />

      {/* Stats footer */}
      <GridSummary
        bookings={gridData.bookings}
        court={selectedCourt}
      />
    </Container>
  );
}

function VenueTabs({
  venueList,
  selectedVenueId,
}: {
  venueList: Awaited<ReturnType<typeof listVenuesForOwner>>;
  selectedVenueId: string;
}) {
  if (venueList.length <= 1) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {venueList.map(({ venue }) => (
        <NavChip
          key={venue.id}
          href={makeGridUrl({ venueId: venue.id })}
          active={venue.id === selectedVenueId}
          className="inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold transition-colors"
          activeClassName="bg-[var(--color-fg)] text-[var(--color-bg)]"
          inactiveClassName="bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)]"
        >
          {venue.name}
        </NavChip>
      ))}
    </div>
  );
}

/** Two-line date pill matching the player picker. */
function DateChip({
  dayLabel,
  dateLabel,
  isToday,
  selected,
  href,
}: {
  isoDate: string;
  dayLabel: string;
  dateLabel: { weekday: string; day: string; month: string };
  isToday: boolean;
  selected: boolean;
  href: string;
}) {
  return (
    <NavChip
      href={href}
      active={selected}
      className="flex w-16 shrink-0 snap-start flex-col items-center justify-center rounded-[var(--radius-md)] border px-1 py-2 text-center transition active:scale-95"
      activeClassName="border-[var(--color-brand-700)] bg-[var(--color-brand-700)] text-white shadow-[var(--shadow-sm)]"
      inactiveClassName="border-[var(--color-border-default)] bg-[var(--color-bg)] text-[var(--color-fg)] hover:border-[var(--color-brand-500)] hover:bg-[var(--color-brand-50)]"
    >
      <span
        className={cn(
          "text-[10px] font-bold uppercase leading-tight tracking-wide",
          selected ? "text-white/90" : "text-[var(--color-fg-muted)]",
        )}
      >
        {isToday ? "TODAY" : dateLabel.weekday}
      </span>
      <span className="mt-0.5 text-base font-extrabold leading-none">{dateLabel.day}</span>
      <span
        className={cn(
          "mt-0.5 text-[10px] font-bold uppercase leading-tight tracking-wide",
          selected ? "text-white/90" : "text-[var(--color-fg-muted)]",
        )}
      >
        {dateLabel.month}
      </span>
      {isToday && !selected && (
        <span className="mt-1 size-1 rounded-full bg-[var(--color-brand-700)]" aria-hidden />
      )}
      {/* aria for screen readers */}
      <span className="sr-only">{dayLabel}</span>
    </NavChip>
  );
}

/** Returns { weekday: "WED", day: "20", month: "MAY" } for the date strip. */
function formatDateChipParts(d: Date): { weekday: string; day: string; month: string } {
  const fmt = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    weekday: get("weekday").toUpperCase(),
    day: get("day"),
    month: get("month").toUpperCase(),
  };
}

function CourtDayGrid({
  court,
  dateIso,
  bookings,
  closures,
  nowMs,
}: {
  court: OwnerGridCourt;
  dateIso: string;
  bookings: OwnerGridBooking[];
  closures: OwnerGridClosure[];
  nowMs: number;
}) {
  const slots = generateDaySlotsManila({
    isoDate: dateIso,
    startHour: court.openHour,
    endHour: court.closeHour,
  });

  // Resolve which booking/closure covers each hourly slot.
  function cellFor(slotStart: Date): GridCell {
    const startMs = slotStart.getTime();
    const endMs = startMs + 60 * 60_000;

    // Closures take visual precedence after bookings (so a booked-but-also-closed cell
    // still shows the booking — closures rarely overlap real bookings anyway).
    const booking = bookings.find(
      (b) => b.startAt.getTime() < endMs && b.endAt.getTime() > startMs,
    );
    if (booking) {
      const isStart = booking.startAt.getTime() === startMs;
      return { kind: "booked", booking, isStart };
    }

    const closure = closures.find(
      (c) => c.startAt.getTime() < endMs && c.endAt.getTime() > startMs,
    );
    if (closure) return { kind: "closed", closure };

    if (endMs <= nowMs) return { kind: "past" };
    return { kind: "open" };
  }

  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
          {court.name} · {formatHourLabel(court.openHour)}–{formatHourLabel(court.closeHour)}
        </h2>
        <p className="text-[11px] text-[var(--color-fg-muted)]">
          Tap a booked tile for details
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {slots.map((s) => (
          <GridTile key={s.toISOString()} slotStart={s} cell={cellFor(s)} />
        ))}
      </div>
    </section>
  );
}

type GridCell =
  | { kind: "open" }
  | { kind: "past" }
  | { kind: "closed"; closure: OwnerGridClosure }
  | { kind: "booked"; booking: OwnerGridBooking; isStart: boolean };

function GridTile({ slotStart, cell }: { slotStart: Date; cell: GridCell }) {
  const slotLabel = slotRangeLabel(slotStart);

  if (cell.kind === "open") {
    return (
      <div className="flex min-h-[68px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg)] px-2 py-3 text-center">
        <span className="text-sm font-bold leading-tight text-[var(--color-fg)]">{slotLabel}</span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-success)]">
          Open
        </span>
      </div>
    );
  }

  if (cell.kind === "past") {
    return (
      <div className="flex min-h-[68px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-2 py-3 text-center opacity-60">
        <span className="text-sm font-bold leading-tight text-[var(--color-fg-subtle)]">
          {slotLabel}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-fg-subtle)]">
          Past
        </span>
      </div>
    );
  }

  if (cell.kind === "closed") {
    return (
      <div
        className="flex min-h-[68px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-2 py-3 text-center"
        title={cell.closure.reason ?? "Court is closed"}
      >
        <span className="text-sm font-bold leading-tight text-[var(--color-fg-subtle)]">
          {slotLabel}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-fg-subtle)]">
          Closed
        </span>
      </div>
    );
  }

  // Booked
  const { booking, isStart } = cell;
  const tone = bookingTileTone(booking.status);
  const firstName = booking.playerDisplayName.split(" ")[0] ?? booking.playerDisplayName;
  return (
    <Link
      href={`/owner/bookings/${booking.id}`}
      className={cn(
        "group relative flex min-h-[68px] flex-col items-stretch justify-center gap-0.5 overflow-hidden rounded-[var(--radius-md)] border px-2 py-2 text-left transition active:scale-[0.98]",
        tone.cell,
      )}
    >
      {/* Top row: time range + status dot */}
      <div className="flex items-center justify-between gap-1">
        <span className={cn("text-[11px] font-bold leading-tight", tone.time)}>{slotLabel}</span>
        <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} aria-hidden />
      </div>
      {/* Player name — only show on the first hour of a multi-hour booking */}
      {isStart ? (
        <>
          <span className={cn("truncate text-sm font-bold leading-tight", tone.name)}>
            {firstName}
          </span>
          <span className={cn("text-[10px] font-semibold uppercase tracking-wide", tone.label)}>
            {tone.statusLabel}
          </span>
        </>
      ) : (
        <span className={cn("text-[10px] font-semibold uppercase tracking-wide", tone.label)}>
          ↑ cont’d
        </span>
      )}
    </Link>
  );
}

function bookingTileTone(status: Booking["status"]): {
  cell: string;
  time: string;
  name: string;
  label: string;
  dot: string;
  statusLabel: string;
} {
  switch (status) {
    case "confirmed":
      return {
        cell:
          "border-[var(--color-brand-700)] bg-[var(--color-brand-700)] text-white hover:bg-[var(--color-brand-800)]",
        time: "text-white/90",
        name: "text-white",
        label: "text-white/80",
        dot: "bg-white",
        statusLabel: "Confirmed",
      };
    case "pending_payment":
    case "payment_submitted":
      return {
        cell:
          "border-[var(--color-warning-300)] bg-[var(--color-warning-50)] text-[var(--color-warning-900)] hover:bg-[var(--color-warning-100)]",
        time: "text-[var(--color-warning-800)]",
        name: "text-[var(--color-warning-900)]",
        label: "text-[var(--color-warning-700)]",
        dot: "bg-[var(--color-warning-600)]",
        statusLabel: status === "pending_payment" ? "Pending pay" : "Receipt in",
      };
    case "refunded":
      return {
        cell:
          "border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)]",
        time: "text-[var(--color-fg-muted)]",
        name: "text-[var(--color-fg)] line-through",
        label: "text-[var(--color-fg-muted)]",
        dot: "bg-[var(--color-fg-subtle)]",
        statusLabel: "Refunded",
      };
    case "open_play":
      return {
        cell:
          "border-[var(--color-info-300)] bg-[var(--color-info-50)] text-[var(--color-info-900)] hover:bg-[var(--color-info-100)]",
        time: "text-[var(--color-info-800)]",
        name: "text-[var(--color-info-900)]",
        label: "text-[var(--color-info-700)]",
        dot: "bg-[var(--color-info-600)]",
        statusLabel: "Open Play",
      };
    default:
      // cancelled / no_show / expired should not appear here (filtered out by repo).
      return {
        cell: "border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)]",
        time: "text-[var(--color-fg-muted)]",
        name: "text-[var(--color-fg)]",
        label: "text-[var(--color-fg-muted)]",
        dot: "bg-[var(--color-fg-subtle)]",
        statusLabel: status,
      };
  }
}

function GridSummary({
  bookings,
  court,
}: {
  bookings: OwnerGridBooking[];
  court: OwnerGridCourt;
}) {
  const openHours = Math.max(0, court.closeHour - court.openHour);
  // Count hours actually booked (exclude refunded for utilisation).
  let bookedHours = 0;
  let revenueCentavos = 0n;
  for (const b of bookings) {
    if (b.status === "refunded") continue;
    const hours = Math.round((b.endAt.getTime() - b.startAt.getTime()) / 3_600_000);
    bookedHours += hours;
    if (b.status === "confirmed") revenueCentavos += b.totalCentavos;
  }
  const utilisation = openHours > 0 ? Math.round((bookedHours / openHours) * 100) : 0;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-3 text-center shadow-[var(--shadow-sm)]">
      <StatBlock label="Booked" value={`${bookedHours}h`} hint={`of ${openHours}h open`} />
      <StatBlock label="Utilisation" value={`${utilisation}%`} hint="hours booked" />
      <StatBlock
        label="Confirmed revenue"
        value={formatPHP(revenueCentavos)}
        hint="excl. pending"
      />
    </div>
  );
}

function StatBlock({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-base font-extrabold leading-tight text-[var(--color-fg)]">{value}</p>
      <p className="text-[10px] text-[var(--color-fg-subtle)]">{hint}</p>
    </div>
  );
}

/** Renders "5–6 AM" / "11 PM–12 AM" for a 1-hour slot. */
function slotRangeLabel(slotStart: Date): string {
  const startMs = slotStart.getTime();
  const endDate = new Date(startMs + 60 * 60_000);

  const startParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    hour12: true,
  }).formatToParts(slotStart);
  const endParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    hour12: true,
  }).formatToParts(endDate);

  const startHour = startParts.find((p) => p.type === "hour")?.value ?? "";
  const startMeridiem = startParts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const endHour = endParts.find((p) => p.type === "hour")?.value ?? "";
  const endMeridiem = endParts.find((p) => p.type === "dayPeriod")?.value ?? "";

  if (startMeridiem === endMeridiem) {
    return `${startHour}–${endHour} ${endMeridiem}`;
  }
  return `${startHour} ${startMeridiem}–${endHour} ${endMeridiem}`;
}

/** Renders "6 AM" for a single hour number (0-24). */
function formatHourLabel(hour: number): string {
  // Build any Manila wall-clock date at that hour to format it.
  const parts = manilaCalendarParts(new Date());
  const d = fromManilaWallClock(parts.year, parts.month, parts.day, hour % 24, 0);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    hour12: true,
  }).format(d);
}
