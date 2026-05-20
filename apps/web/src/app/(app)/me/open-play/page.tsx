import Link from "next/link";
import { redirect } from "next/navigation";
import { Calendar, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/service";
import { listSignupsForPlayer } from "@/features/open-play";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { CancelSignupButton } from "./cancel-signup-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Open Play" };

type SignupStatus =
  | "pending_payment"
  | "payment_submitted"
  | "confirmed"
  | "cancelled"
  | "expired"
  | "refunded";

function statusVariant(status: SignupStatus): "success" | "warning" | "info" | "danger" | "neutral" {
  switch (status) {
    case "confirmed":
      return "success";
    case "pending_payment":
      return "warning";
    case "payment_submitted":
      return "info";
    case "cancelled":
      return "danger";
    case "expired":
    case "refunded":
      return "neutral";
  }
}

export default async function MeOpenPlayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/me/open-play");

  const rows = await listSignupsForPlayer(user.id);

  // RSC: evaluated once per request, not a render-loop hazard.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const upcoming = rows
    .filter((r) => r.session.endAt.getTime() >= now && r.signup.status !== "cancelled" && r.signup.status !== "expired")
    .sort((a, b) => a.session.startAt.getTime() - b.session.startAt.getTime());
  const past = rows.filter((r) => !upcoming.includes(r));

  return (
    <Container className="max-w-4xl py-3 sm:py-4">
      <PageHeader
        kicker="My account"
        title="Open Play"
        subtitle="Your sign-ups, payments, and upcoming sessions."
        action={
          <Link href="/open-play" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Browse sessions
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No Open Play signups yet"
          description="Find an upcoming session at a venue near you."
          action={
            <Link href="/open-play" className={buttonVariants()}>
              Browse Open Play
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
                Upcoming
              </h2>
              {upcoming.map((row) => (
                <SignupRow key={row.signup.id} row={row} />
              ))}
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
                Past & cancelled
              </h2>
              {past.map((row) => (
                <SignupRow key={row.signup.id} row={row} />
              ))}
            </section>
          )}
        </div>
      )}
    </Container>
  );
}

function SignupRow({
  row,
}: {
  row: Awaited<ReturnType<typeof listSignupsForPlayer>>[number];
}) {
  const { signup, session, venue, courts } = row;
  const status = signup.status as SignupStatus;
  const canPay = status === "pending_payment";
  const cancelDeadline = signup.cancellableUntil.getTime();
  const canCancel =
    status === "pending_payment" && cancelDeadline > Date.now(); // eslint-disable-line react-hooks/purity

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/open-play/${session.id}`}
              className="truncate font-semibold hover:text-[var(--color-brand-700)]"
            >
              {session.title}
            </Link>
            <Badge variant={statusVariant(status)}>{status.replaceAll("_", " ")}</Badge>
          </div>
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--color-fg-muted)]">
            <MapPin className="size-3" />
            {venue.name} · {venue.city} · {courts.map((c) => c.name).join(" · ")}
          </div>
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--color-fg-muted)]">
            <Calendar className="size-3" />
            {formatDateTimeManila(session.startAt)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-sm font-semibold text-[var(--color-brand-700)]">
            {formatPHP(signup.totalCentavos)}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canPay && (
              <Link
                href={`/open-play/signups/${signup.id}/pay`}
                className={buttonVariants({ size: "sm" })}
              >
                Pay now
              </Link>
            )}
            {!canPay && status !== "cancelled" && status !== "expired" && (
              <Link
                href={`/open-play/signups/${signup.id}/pay`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                View
              </Link>
            )}
            {canCancel && <CancelSignupButton signupId={signup.id} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
