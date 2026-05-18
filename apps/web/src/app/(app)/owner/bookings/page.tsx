import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronRight } from "lucide-react";
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
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import type { Booking } from "@/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings history" };

const STATUS_TABS: { key: OwnerBookingStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
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

  return (
    <Container className="py-3 sm:py-4">
      <PageHeader
        kicker="Owner"
        title="Bookings history"
        subtitle="All bookings across your venues"
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

      {/* Booking list */}
      {items.length === 0 ? (
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
          <ul className="mt-4 divide-y divide-[var(--color-border-default)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] shadow-[var(--shadow-sm)]">
            {items.map((item) => (
              <BookingRow
                key={item.booking.id}
                item={item}
                showVenue={showVenueFilter && !venueId}
              />
            ))}
          </ul>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-[var(--color-fg-muted)]">
              {items.length} booking{items.length === 1 ? "" : "s"}
              {cursor ? " · more results above" : ""}
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
  return (
    <li>
      <Link
        href={`/owner/bookings/${item.booking.id}`}
        className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--color-bg-subtle)] active:bg-[var(--color-bg-muted)]"
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-[var(--color-fg)]">
              {item.playerDisplayName}
            </span>
            <BookingStatusBadge status={item.booking.status} />
          </div>
          <div className="text-xs text-[var(--color-fg-muted)]">
            {showVenue ? `${item.venue.name} · ` : ""}
            {item.court.name} · {formatDateTimeManila(item.booking.startAt)}
          </div>
          <div className="text-sm font-bold text-[var(--color-brand-700)]">
            {formatPHP(item.booking.totalCentavos)}
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-[var(--color-fg-subtle)]" />
      </Link>
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
