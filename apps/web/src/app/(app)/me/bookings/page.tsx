import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/service";
import { listBookingsForPlayer } from "@/features/bookings-view";
import { findReviewForBooking } from "@/features/reviews/service";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { CancelBookingButton } from "./cancel-button";
import { LeaveReviewForm } from "./_components/leave-review-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "My bookings" };

export default async function MyBookingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent("/me/bookings")}`);

  const items = await listBookingsForPlayer(user.id);
  // RSC: runs once per request.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  // Load review status for reviewable bookings in parallel.
  const reviewableIds = items
    .filter((it) => it.booking.status === "confirmed" && it.booking.endAt.getTime() < now)
    .map((it) => it.booking.id);
  const reviewResults = await Promise.all(
    reviewableIds.map((id) => findReviewForBooking(id).then((r) => ({ id, reviewed: r !== null }))),
  );
  const reviewedBookingIds = new Set(
    reviewResults.filter((r) => r.reviewed).map((r) => r.id),
  );
  const hasWaitingBooking = items.some((item) => item.booking.status === "payment_submitted");

  return (
    <Container className="py-3 sm:py-4">
      {hasWaitingBooking && <AutoRefresh intervalMs={10_000} />}
      <PageHeader
        kicker="My bookings"
        title={`${items.length} booking${items.length === 1 ? "" : "s"}`}
        action={
          <Link href="/venues" className={buttonVariants({ size: "sm" })}>
            Find a court
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title="No bookings yet"
          description="Find a venue, pick a time, and you're set."
          action={
            <Link href="/venues">
              <Button>Find a court</Button>
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--color-border-default)]">
          {items.map((it) => {
            const cancellable =
              ["pending_payment", "payment_submitted", "confirmed"].includes(it.booking.status) &&
              it.booking.cancellableUntil.getTime() > now;
            const needsPayment = it.booking.status === "pending_payment";
            const isReviewable =
              it.booking.status === "confirmed" && it.booking.endAt.getTime() < now;
            const alreadyReviewed = reviewedBookingIds.has(it.booking.id);
            return (
              <li key={it.booking.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/venues/${it.venue.slug}`}
                        className="truncate font-semibold hover:text-[var(--color-brand-700)]"
                      >
                        {it.venue.name}
                      </Link>
                      <StatusBadge status={it.booking.status} />
                    </div>
                    <div className="text-xs text-[var(--color-fg-muted)]">
                      {it.court.name} · {formatDateTimeManila(it.booking.startAt)}
                    </div>
                    <div className="text-sm font-bold text-[var(--color-brand-700)]">
                      {formatPHP(it.booking.totalCentavos)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {needsPayment && (
                      <Link href={`/book/${it.booking.id}/pay`} className={buttonVariants({ size: "sm" })}>
                        Pay now
                      </Link>
                    )}
                    {it.booking.status === "payment_submitted" && (
                      <Link
                        href={`/book/${it.booking.id}/pay`}
                        className={buttonVariants({ size: "sm", variant: "outline" })}
                      >
                        View
                      </Link>
                    )}
                    {cancellable && <CancelBookingButton bookingId={it.booking.id} />}
                    {isReviewable && alreadyReviewed && (
                      <span className="text-xs font-semibold text-[var(--color-success)]">✓ Reviewed</span>
                    )}
                  </div>
                </div>
                {isReviewable && !alreadyReviewed && (
                  <LeaveReviewForm bookingId={it.booking.id} venueName={it.venue.name} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: "success" | "warning" | "info" | "danger" | "neutral" =
    status === "confirmed"
      ? "success"
      : status === "pending_payment" || status === "payment_submitted"
        ? "info"
        : status === "expired" || status === "no_show"
          ? "warning"
          : status === "cancelled"
            ? "danger"
            : "neutral";
  return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>;
}
