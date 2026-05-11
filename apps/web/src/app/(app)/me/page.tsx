import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  Search,
  Star,
  Trophy,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { getPlayerDashboardData, type DashboardUpcoming, type DashboardRecentItem, type PlayerDashboardData } from "@/features/bookings-view";
import { getSessionUser } from "@/server/session";
import { formatDateLongManila, formatTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function PlayerDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent("/me")}`);
  // Venue owners have their own dashboard.
  if (user.role === "venue_owner") redirect("/owner");
  if (user.role === "admin") redirect("/admin");

  const data = await getPlayerDashboardData(user.id);
  const firstName = user.displayName.split(" ")[0] ?? user.displayName;

  return (
    <main className="flex flex-1 flex-col">
      {/* ── Greeting header ── */}
      <div className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-subtle)]">
        <Container className="py-6 sm:py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-fg-muted)]">Good day,</p>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                {firstName} 👋
              </h1>
            </div>
            <Link
              href="/venues"
              className={cn(buttonVariants({ size: "lg" }), "shrink-0 shadow-[var(--shadow-sm)]")}
            >
              <Search aria-hidden="true" />
              Find a court
            </Link>
          </div>
        </Container>
      </div>

      <Container className="flex-1 py-6 sm:py-8">
        <div className="flex flex-col gap-8">

          {/* ── Next up ── */}
          <NextUpSection upcoming={data.upcoming} />

          {/* ── Quick actions ── */}
          <QuickActionsSection recentVenueSlug={data.recent[0]?.venue.slug ?? null} />

          {/* ── Stats ── */}
          {data.stats.totalSessions > 0 && (
            <StatsSection stats={data.stats} />
          )}

          {/* ── Pending reviews ── */}
          {data.pendingReviewBookingIds.length > 0 && (
            <PendingReviewsSection bookingIds={data.pendingReviewBookingIds} />
          )}

          {/* ── Recent bookings ── */}
          {data.recent.length > 0 && (
            <RecentBookingsSection items={data.recent} />
          )}

          {/* ── No activity yet — warm empty state ── */}
          {data.stats.totalSessions === 0 && data.upcoming === null && (
            <EmptyDashboard />
          )}

        </div>
      </Container>
    </main>
  );
}

// ===========================================================================
// Next up
// ===========================================================================

function NextUpSection({ upcoming }: { upcoming: DashboardUpcoming | null }) {
  if (!upcoming) {
    return (
      <section aria-labelledby="nextup-heading">
        <SectionLabel id="nextup-heading">Next up</SectionLabel>
        <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] p-6 text-center">
          <CalendarDays className="mx-auto mb-2 size-8 text-[var(--color-fg-subtle)]" />
          <p className="font-medium text-[var(--color-fg-muted)]">No upcoming bookings</p>
          <p className="mt-1 text-sm text-[var(--color-fg-subtle)]">
            Find a court and grab the next open slot.
          </p>
          <Link href="/venues" className={cn(buttonVariants({ size: "sm" }), "mt-4")}>
            Find a court
          </Link>
        </div>
      </section>
    );
  }

  const isPendingPayment =
    upcoming.booking.status === "pending_payment" ||
    upcoming.booking.status === "payment_submitted";
  const isConfirmed = upcoming.booking.status === "confirmed";

  const dateLabel = formatDateLongManila(upcoming.booking.startAt);
  const timeLabel = `${formatTimeManila(upcoming.booking.startAt)} – ${formatTimeManila(upcoming.booking.endAt)}`;

  return (
    <section aria-labelledby="nextup-heading">
      <SectionLabel id="nextup-heading">Next up</SectionLabel>
      <div
        className={cn(
          "relative overflow-hidden rounded-[var(--radius-xl)] border p-5 sm:p-6",
          isConfirmed
            ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-50)]"
            : "border-[var(--color-warning-500)]/30 bg-orange-50",
        )}
      >
        {/* Decorative glow */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -right-10 -top-10 size-40 rounded-full opacity-20 blur-3xl",
            isConfirmed ? "bg-[var(--color-brand-500)]" : "bg-[var(--color-warning-500)]",
          )}
        />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            {/* Status pill */}
            {isConfirmed ? (
              <Badge variant="success" className="mb-3">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Confirmed
              </Badge>
            ) : (
              <Badge variant="warning" className="mb-3">
                <CreditCard className="size-3" aria-hidden="true" />
                {upcoming.booking.status === "payment_submitted"
                  ? "Payment submitted"
                  : "Awaiting payment"}
              </Badge>
            )}

            {/* Venue & court */}
            <h2 className="text-xl font-extrabold tracking-tight text-[var(--color-fg)] sm:text-2xl">
              {upcoming.venue.name}
            </h2>
            <p className="mt-0.5 text-sm font-medium text-[var(--color-fg-muted)]">
              {upcoming.court.name}
            </p>

            {/* Date + time */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-fg-muted)]">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                {dateLabel}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="size-4 shrink-0" aria-hidden="true" />
                {timeLabel}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4 shrink-0" aria-hidden="true" />
                {upcoming.venue.city}
              </span>
            </div>
          </div>

          {/* Amount + actions */}
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <p className="text-lg font-bold text-[var(--color-fg)]">
              {formatPHP(upcoming.booking.totalCentavos)}
            </p>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/book/${upcoming.booking.id}/pay`}
                className={cn(
                  buttonVariants({ size: "sm", variant: isPendingPayment ? "default" : "outline" }),
                )}
              >
                {isPendingPayment ? "Pay now" : "View booking"}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ===========================================================================
// Quick actions
// ===========================================================================

function QuickActionsSection({ recentVenueSlug }: { recentVenueSlug: string | null }) {
  const actions = [
    {
      icon: Search,
      label: "Find a court",
      sub: "Browse all venues",
      href: "/venues",
      color: "text-[var(--color-brand-600)] bg-[var(--color-brand-100)]",
    },
    {
      icon: CalendarDays,
      label: "My bookings",
      sub: "All sessions",
      href: "/me/bookings",
      color: "text-sky-600 bg-sky-100",
    },
    ...(recentVenueSlug
      ? [
          {
            icon: Zap,
            label: "Book again",
            sub: "Last venue",
            href: `/venues/${recentVenueSlug}`,
            color: "text-amber-600 bg-amber-100",
          },
        ]
      : []),
  ];

  return (
    <section aria-labelledby="quick-heading">
      <SectionLabel id="quick-heading">Quick actions</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {actions.map(({ icon: Icon, label, sub, href, color }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 transition-shadow hover:shadow-[var(--shadow-md)]"
          >
            <span
              className={cn(
                "inline-flex size-10 items-center justify-center rounded-[var(--radius-lg)]",
                color,
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[var(--color-fg)] group-hover:text-[var(--color-brand-600)]">
                {label}
              </span>
              <span className="block text-xs text-[var(--color-fg-subtle)]">{sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ===========================================================================
// Stats
// ===========================================================================

function StatsSection({
  stats,
}: {
  stats: PlayerDashboardData["stats"];
}) {
  const items = [
    { label: "Sessions played", value: String(stats.totalSessions), icon: Trophy },
    { label: "Hours on court", value: `${stats.totalHours}h`, icon: Clock },
    { label: "Venues visited", value: String(stats.uniqueVenues), icon: MapPin },
    ...(stats.favoriteVenueName
      ? [{ label: "Fave venue", value: stats.favoriteVenueName, icon: Star, small: true }]
      : []),
  ] satisfies Array<{ label: string; value: string; icon: typeof Trophy; small?: boolean }>;

  return (
    <section aria-labelledby="stats-heading">
      <SectionLabel id="stats-heading">Your year</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(({ label, value, icon: Icon, small }) => (
          <div
            key={label}
            className="flex flex-col justify-between rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4"
          >
            <Icon className="size-4 text-[var(--color-brand-500)] mb-2" aria-hidden="true" />
            <p
              className={cn(
                "font-extrabold leading-tight tracking-tight text-[var(--color-fg)]",
                small ? "text-base" : "text-2xl",
              )}
            >
              {value}
            </p>
            <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ===========================================================================
// Pending reviews
// ===========================================================================

function PendingReviewsSection({ bookingIds }: { bookingIds: string[] }) {
  return (
    <section aria-labelledby="review-heading">
      <SectionLabel id="review-heading">Leave a review</SectionLabel>
      <div className="flex flex-col gap-2">
        {bookingIds.map((id) => (
          <Link
            key={id}
            href={`/me/bookings`}
            className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 transition-shadow hover:shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Star className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-[var(--color-fg)]">
                  How was your session?
                </p>
                <p className="text-xs text-[var(--color-fg-muted)]">Tap to leave a rating</p>
              </div>
            </div>
            <ArrowRight className="size-4 text-[var(--color-fg-subtle)]" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}

// ===========================================================================
// Recent bookings
// ===========================================================================

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "success" | "neutral" | "danger" | "warning" }
> = {
  confirmed: { label: "Confirmed", variant: "success" },
  pending_payment: { label: "Awaiting payment", variant: "warning" },
  payment_submitted: { label: "Payment submitted", variant: "warning" },
  cancelled: { label: "Cancelled", variant: "danger" },
  no_show: { label: "No show", variant: "danger" },
  expired: { label: "Expired", variant: "neutral" },
  refunded: { label: "Refunded", variant: "neutral" },
};

function RecentBookingsSection({ items }: { items: DashboardRecentItem[] }) {
  return (
    <section aria-labelledby="recent-heading">
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel id="recent-heading" className="mb-0">
          Recent sessions
        </SectionLabel>
        <Link
          href="/me/bookings"
          className="flex items-center gap-1 text-sm font-medium text-[var(--color-brand-600)] hover:underline"
        >
          View all
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg)] divide-y divide-[var(--color-border-default)]">
        {items.map(({ booking, venue, court, hasReview }) => {
          const cfg = STATUS_CONFIG[booking.status] ?? { label: booking.status, variant: "neutral" as const };
          const timeLabel = `${formatTimeManila(booking.startAt)} – ${formatTimeManila(booking.endAt)}`;
          return (
            <Link
              key={booking.id}
              href={`/me/bookings`}
              className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[var(--color-bg-subtle)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--color-fg)]">
                  {venue.name}
                </p>
                <p className="truncate text-xs text-[var(--color-fg-muted)]">
                  {court.name} · {formatDateLongManila(booking.startAt)} · {timeLabel}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={cfg.variant}>{cfg.label}</Badge>
                {booking.status === "confirmed" && !hasReview && (
                  <span className="text-xs text-amber-600 font-medium">Rate session →</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ===========================================================================
// Empty state
// ===========================================================================

function EmptyDashboard() {
  return (
    <section className="py-6 text-center">
      <div className="mx-auto max-w-sm">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[var(--color-brand-100)]">
          <CalendarDays className="size-8 text-[var(--color-brand-600)]" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-[var(--color-fg)]">Welcome to DinkHub!</h2>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
          Book your first pickleball session in seconds. Find a court near you and pay through
          GCash — no phone calls needed.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/venues" className={buttonVariants({ size: "lg" })}>
            <Search aria-hidden="true" />
            Find a court
          </Link>
        </div>
      </div>
    </section>
  );
}

// ===========================================================================
// Shared
// ===========================================================================

function SectionLabel({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={cn(
        "mb-3 text-xs font-bold uppercase tracking-widest text-[var(--color-fg-subtle)]",
        className,
      )}
    >
      {children}
    </h2>
  );
}
