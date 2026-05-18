import Link from "next/link";
import { Suspense } from "react";
import { Calendar, MapPin, Trophy, Users } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { LocationPrompt } from "@/components/location-prompt";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { formatDistanceKm } from "@/lib/distance";
import { listPublishedSessions, type SessionListItem } from "@/features/open-play";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Open Play — drop-in pickleball sessions",
  description:
    "Find drop-in pickleball Open Play sessions near you. Pay in GCash and show up to play.",
};

const skillLabel: Record<string, string> = {
  any: "All levels",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseNear(
  sp: Record<string, string | string[] | undefined>,
): { lat: number; lng: number } | null {
  const latStr = pickString(sp.lat);
  const lngStr = pickString(sp.lng);
  if (!latStr || !lngStr) return null;
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicOpenPlayPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const near = parseNear(sp);

  return (
    <Container className="max-w-6xl py-3 sm:py-4">
      <PageHeader
        kicker="Open Play"
        title="Drop in. Play more pickleball."
        subtitle="Browse upcoming Open Play sessions hosted by venues. Pay in GCash and you're in."
      />

      <LocationPrompt scope="open-play" active={near !== null} />

      <Suspense fallback={<SessionsSkeleton />}>
        <SessionsList near={near} />
      </Suspense>
    </Container>
  );
}

async function SessionsList({ near }: { near: { lat: number; lng: number } | null }) {
  const sessions = await listPublishedSessions(near ? { near } : {});

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<Trophy />}
        title="No Open Play sessions yet"
        description="Check back soon — venues are posting new sessions every week."
        action={
          <Link
            href="/venues"
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-500)] px-4 text-sm font-medium text-white hover:bg-[var(--color-brand-600)]"
          >
            Browse venues
          </Link>
        }
      />
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sessions.map((s) => (
        <SessionCard key={s.session.id} item={s} />
      ))}
    </ul>
  );
}

function SessionCard({ item }: { item: SessionListItem }) {
  const { session, venue, court, activeSignupCount, distanceKm } = item;
  const pct = Math.min(100, Math.round((activeSignupCount / session.capacity) * 100));
  const spotsLeft = Math.max(0, session.capacity - activeSignupCount);
  const totalPrice = session.pricePerPlayerCentavos + session.systemFeePerPlayerCentavos;

  return (
    <li>
      <Link
        href={`/open-play/${session.id}`}
        className="group flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 transition hover:border-[var(--color-brand-500)] hover:shadow-[var(--shadow-md)]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold group-hover:text-[var(--color-brand-700)]">
              {session.title}
            </h3>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[var(--color-fg-muted)]">
              <span className="inline-flex min-w-0 items-center">
                <MapPin className="-mt-0.5 mr-0.5 inline size-3" />
                <span className="truncate">{venue.name} · {venue.city}</span>
              </span>
              {distanceKm !== null && (
                <span className="shrink-0 rounded-full bg-[var(--color-brand-50)] px-1.5 py-px text-[10px] font-semibold text-[var(--color-brand-700)]">
                  {formatDistanceKm(distanceKm)}
                </span>
              )}
            </p>
          </div>
          <Badge variant={spotsLeft === 0 ? "danger" : "success"}>
            {spotsLeft === 0 ? "Full" : `${spotsLeft} left`}
          </Badge>
        </div>

        <dl className="mt-3 space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-[var(--color-fg-muted)]">
            <Calendar className="size-3.5" />
            <span className="text-[var(--color-fg)]">{formatDateTimeManila(session.startAt)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[var(--color-fg-muted)]">
            <Trophy className="size-3.5" />
            <span>{skillLabel[session.skillLevel] ?? session.skillLevel}</span>
            <span>·</span>
            <span>{court.name}</span>
          </div>
        </dl>

        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="inline-flex items-center gap-1 text-[var(--color-fg-muted)]">
              <Users className="size-3" />
              {activeSignupCount} / {session.capacity}
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

        <div className="mt-4 flex items-end justify-between border-t border-[var(--color-border-default)] pt-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">
              Per player
            </div>
            <div className="text-lg font-bold text-[var(--color-brand-700)]">
              {formatPHP(totalPrice)}
            </div>
          </div>
          <span className="text-xs font-medium text-[var(--color-brand-700)] group-hover:underline">
            View →
          </span>
        </div>
      </Link>
    </li>
  );
}

function SessionsSkeleton() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i}>
          <Skeleton className="h-56 w-full rounded-[var(--radius-lg)]" />
        </li>
      ))}
    </ul>
  );
}
