import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarPlus, Users, Trophy } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatPHP } from "@/lib/money";
import { formatDateTimeManila } from "@/lib/date";
import { getVenueWithCourtsForOwner } from "@/features/owner-venues/service";
import { OwnerVenueError } from "@/features/owner-venues/errors";
import { listSessionsByVenue } from "@/features/open-play";
import type { OpenPlaySession } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Open Play · ${id.slice(0, 8)}` };
}

export default async function VenueOpenPlayListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getSessionUser();
  if (!profile) {
    redirect(`/sign-in?next=${encodeURIComponent(`/owner/venues/${id}/open-play`)}`);
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

  try {
    await getVenueWithCourtsForOwner(id, profile.id);
  } catch (err) {
    if (err instanceof OwnerVenueError && err.code === "venue_not_found") notFound();
    if (err instanceof OwnerVenueError && err.code === "forbidden") {
      return (
        <Container className="py-4">
          <Alert variant="warning" title="Not your venue">
            You don&apos;t have access to this venue.
          </Alert>
        </Container>
      );
    }
    throw err;
  }

  const sessions = await listSessionsByVenue(id);

  return (
    <Container className="max-w-5xl py-3 sm:py-4">
      <PageHeader
        back={{ href: `/owner/venues/${id}`, label: "Venue" }}
        kicker="Open Play"
        title="Open Play sessions"
        subtitle="Run drop-in games and recruit players from the marketplace."
        action={
          <Link
            href={`/owner/venues/${id}/open-play/new`}
            className={buttonVariants({ size: "sm" })}
          >
            <CalendarPlus className="size-4" />
            New session
          </Link>
        }
      />

      {sessions.length === 0 ? (
        <EmptyState
          icon={<Trophy />}
          title="No Open Play sessions yet"
          description="Create a session and DinkHub will list it on the public Open Play board so players can join."
          action={
            <Link
              href={`/owner/venues/${id}/open-play/new`}
              className={buttonVariants({ size: "sm" })}
            >
              <CalendarPlus className="size-4" />
              Create first session
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sessions.map((s) => (
            <SessionCard
              key={s.session.id}
              session={s.session}
              courtName={s.court.name}
              activeCount={s.activeSignupCount}
            />
          ))}
        </ul>
      )}
    </Container>
  );
}

function SessionCard({
  session,
  courtName,
  activeCount,
}: {
  session: OpenPlaySession;
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
            <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">{courtName}</p>
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
  const map: Record<OpenPlaySession["status"], { label: string; variant: Parameters<typeof Badge>[0]["variant"] }> = {
    draft: { label: "Draft", variant: "neutral" },
    published: { label: "Published", variant: "success" },
    cancelled: { label: "Cancelled", variant: "danger" },
    completed: { label: "Completed", variant: "info" },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
