import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus, Trophy, Users } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatPHP } from "@/lib/money";
import { formatDateTimeManila } from "@/lib/date";
import { listSessionsByOwner } from "@/features/open-play";
import { listVenuesForOwner } from "@/features/owner-venues/service";
import type { OpenPlaySession } from "@/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Open Play · Owner" };

export default async function OwnerOpenPlayIndexPage() {
  const profile = await getSessionUser();
  if (!profile) {
    redirect(`/sign-in?next=${encodeURIComponent("/owner/open-play")}`);
  }
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-4">
        <Alert variant="warning" title="Owner access required">
          Your account isn&apos;t set up as a venue owner.
        </Alert>
      </Container>
    );
  }

  const [sessions, venueList] = await Promise.all([
    listSessionsByOwner(profile.id),
    listVenuesForOwner(profile.id),
  ]);
  const activeVenues = venueList.filter((v) => v.venue.status === "active" && v.courtCount > 0);
  const hasVenueToHost = activeVenues.length > 0;
  const firstVenueId = activeVenues[0]?.venue.id;

  return (
    <Container className="max-w-5xl py-3 sm:py-4">
      <PageHeader
        back={{ href: "/owner", label: "Dashboard" }}
        kicker="Open Play"
        title="Open Play sessions"
        subtitle="Run drop-in games across all your venues. Players join from the public board and pay via GCash."
        action={
          hasVenueToHost && firstVenueId ? (
            <Link
              href={`/owner/venues/${firstVenueId}/open-play/new`}
              className={buttonVariants({ size: "sm" })}
            >
              <CalendarPlus className="size-4" />
              New session
            </Link>
          ) : undefined
        }
      />

      {!hasVenueToHost ? (
        <Alert variant="info" title="Add a venue first">
          You need at least one active venue with a court before you can host Open Play sessions.{" "}
          <Link href="/owner/venues" className="font-semibold underline-offset-4 hover:underline">
            Manage venues →
          </Link>
        </Alert>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Trophy />}
          title="No Open Play sessions yet"
          description="Create a session and DinkHub will list it on the public Open Play board so players can join."
          action={
            firstVenueId ? (
              <Link
                href={`/owner/venues/${firstVenueId}/open-play/new`}
                className={buttonVariants({ size: "sm" })}
              >
                <CalendarPlus className="size-4" />
                Create first session
              </Link>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sessions.map((s) => (
            <SessionCard
              key={s.session.id}
              session={s.session}
              venueName={s.venue.name}
              courtName={s.court.name}
              activeCount={s.activeSignupCount}
            />
          ))}
        </ul>
      )}

      {hasVenueToHost && activeVenues.length > 1 && (
        <section className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
            Create at a specific venue
          </h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {activeVenues.map(({ venue }) => (
              <Link
                key={venue.id}
                href={`/owner/venues/${venue.id}/open-play`}
                className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-3 text-sm hover:border-[var(--color-brand-500)]"
              >
                <span className="font-semibold">{venue.name}</span>
                <span className="block text-xs text-[var(--color-fg-muted)]">
                  {venue.city}, {venue.province}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}

function SessionCard({
  session,
  venueName,
  courtName,
  activeCount,
}: {
  session: OpenPlaySession;
  venueName: string;
  courtName: string;
  activeCount: number;
}) {
  const pct = Math.min(100, Math.round((activeCount / session.capacity) * 100));
  return (
    <li>
      <Link
        href={`/owner/open-play/${session.id}`}
        className="block rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 transition hover:border-[var(--color-brand-500)] hover:shadow-[var(--shadow-sm)]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{session.title}</h3>
            <p className="mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">
              {venueName} · {courtName}
            </p>
          </div>
          <SessionStatusBadge status={session.status} />
        </div>

        <div className="mt-3 space-y-1 text-xs text-[var(--color-fg-muted)]">
          <div>{formatDateTimeManila(session.startAt)}</div>
          <div>{formatPHP(session.pricePerPlayerCentavos)} per player</div>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="inline-flex items-center gap-1 text-[var(--color-fg-muted)]">
              <Users className="size-3" />
              {activeCount} / {session.capacity}
            </span>
            <span className="font-medium tabular-nums text-[var(--color-fg-muted)]">{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-muted)]">
            <div
              className="h-full bg-[var(--color-brand-500)] transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </Link>
    </li>
  );
}

function SessionStatusBadge({ status }: { status: OpenPlaySession["status"] }) {
  const map: Record<
    OpenPlaySession["status"],
    { label: string; variant: Parameters<typeof Badge>[0]["variant"] }
  > = {
    draft: { label: "Draft", variant: "neutral" },
    published: { label: "Published", variant: "success" },
    cancelled: { label: "Cancelled", variant: "danger" },
    completed: { label: "Completed", variant: "info" },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
