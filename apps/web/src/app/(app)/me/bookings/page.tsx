import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/features/auth/service";
import { listBookingsForPlayer } from "@/features/bookings-view";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { CancelBookingButton } from "./cancel-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "My bookings" };

export default async function MyBookingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent("/me/bookings")}`);

  const items = await listBookingsForPlayer(user.id);
  const now = Date.now();

  return (
    <Container className="py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My bookings</h1>
        <p className="text-[var(--color-fg-muted)]">All your courts in one place.</p>
      </div>

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
        <ul className="space-y-3">
          {items.map((it) => {
            const cancellable =
              (it.booking.status === "pending_payment" || it.booking.status === "payment_submitted") &&
              it.booking.cancellableUntil.getTime() > now;
            const needsPayment = it.booking.status === "pending_payment";
            return (
              <Card key={it.booking.id}>
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/venues/${it.venue.slug}`}
                        className="font-semibold hover:text-[var(--color-brand-700)]"
                      >
                        {it.venue.name}
                      </Link>
                      <span className="text-sm text-[var(--color-fg-muted)]">· {it.court.name}</span>
                      <StatusBadge status={it.booking.status} />
                    </div>
                    <div className="text-sm text-[var(--color-fg-muted)]">
                      {formatDateTimeManila(it.booking.startAt)} → {formatDateTimeManila(it.booking.endAt)}
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold">{formatPHP(it.booking.totalCentavos)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {needsPayment && (
                      <Link href={`/book/${it.booking.id}/pay`}>
                        <Button size="sm">Pay now</Button>
                      </Link>
                    )}
                    {it.booking.status === "payment_submitted" && (
                      <Link href={`/book/${it.booking.id}/pay`}>
                        <Button size="sm" variant="outline">
                          View
                        </Button>
                      </Link>
                    )}
                    {cancellable && <CancelBookingButton bookingId={it.booking.id} />}
                  </div>
                </CardContent>
              </Card>
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
