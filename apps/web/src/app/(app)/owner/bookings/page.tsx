import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronRight, Mail, Phone } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  listBookingsForOwner,
  type OwnerBookingListItem,
  type OwnerBookingStatusFilter,
} from "@/features/bookings-view";
import { listVenuesForOwner } from "@/features/owner-venues/service";
import { formatDateLongManila, formatTimeManila, manilaCalendarParts } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import type { Booking } from "@/db/schema";

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
  const rawStatus = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const rawVenue = Array.isArray(sp.venue) ? sp.venue[0] : sp.venue;
  const rawCursor = Array.isArray(sp.cursor) ? sp.cursor[0] : sp.cursor;

  const statusFilter: OwnerBookingStatusFilter =
    rawStatus && VALID_STATUS_KEYS.has(rawStatus)
      ? (rawStatus as OwnerBookingStatusFilter)
      : "all";

  const venueId =
    rawVenue && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(rawVenue)
      ? rawVenue
      : undefined;

  const cursor = rawCursor ?? undefined;

  const [{ items, nextCursor }, venueList] = await Promise.all([
    listBookingsForOwner({
      ownerId: profile.id,
      statusFilter,
      ...(venueId !== undefined ? { venueId } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    }),
    listVenuesForOwner(profile.id),
  ]);

  const showVenueFilter = venueList.length > 1;
  const groups = groupByManilaDay(items);

  return (
    <Container className="py-3 sm:py-4">
      <PageHeader
        kicker="Owner"
        title="Bookings schedule"
        subtitle="Every confirmed booking, grouped by day"
        action={
          <Link href="/owner" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Dashboard
          </Link>
        }
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
