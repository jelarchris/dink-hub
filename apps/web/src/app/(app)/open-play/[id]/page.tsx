import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, MapPin, Trophy, Users } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import { getCurrentUser } from "@/features/auth/service";
import {
  countActiveSignups,
  findSessionWithVenue,
  findSignupById,
  listCourtsForSessions,
  listSignupsForPlayer,
} from "@/features/open-play";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

const skillLabel: Record<string, string> = {
  any: "All skill levels",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await findSessionWithVenue(id);
  if (!detail) return { title: "Open Play session" };
  return {
    title: `${detail.session.title} · ${detail.venue.name}`,
    description: `Open Play at ${detail.venue.name} on ${formatDateTimeManila(detail.session.startAt)}`,
  };
}

export default async function PublicOpenPlayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await findSessionWithVenue(id);
  if (!detail) notFound();

  const { session, venue, court } = detail;
  if (session.status !== "published" && session.status !== "completed") {
    notFound();
  }

  const courtsMap = await listCourtsForSessions([session.id]);
  const courts = courtsMap.get(session.id) ?? [{ id: court.id, name: court.name }];

  const user = await getCurrentUser();
  const activeCount = await countActiveSignups(session.id);
  const spotsLeft = Math.max(0, session.capacity - activeCount);
  const pct = Math.min(100, Math.round((activeCount / session.capacity) * 100));
  const totalPrice = session.pricePerPlayerCentavos + session.systemFeePerPlayerCentavos;

  // Has the current user already signed up for this session?
  let existingSignupId: string | null = null;
  if (user) {
    const signups = await listSignupsForPlayer(user.id);
    const match = signups.find(
      (s) =>
        s.signup.sessionId === session.id &&
        s.signup.status !== "cancelled" &&
        s.signup.status !== "expired",
    );
    existingSignupId = match?.signup.id ?? null;
  }

  const sessionStarted = session.startAt.getTime() <= Date.now(); // eslint-disable-line react-hooks/purity
  const sessionEnded = session.endAt.getTime() <= Date.now(); // eslint-disable-line react-hooks/purity

  return (
    <Container className="max-w-5xl py-3 sm:py-4">
      <PageHeader
        back={{ href: "/open-play", label: "Open Play" }}
        kicker="Open Play"
        title={session.title}
        subtitle={`${venue.name} · ${venue.city}`}
        action={<Badge variant={spotsLeft === 0 ? "danger" : "success"}>{spotsLeft === 0 ? "Full" : `${spotsLeft} spots left`}</Badge>}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {sessionEnded && (
            <Alert variant="info" title="Session ended">
              This Open Play session has already ended.
            </Alert>
          )}

          {session.description && (
            <section>
              <SectionLabel className="mb-2 block">About this session</SectionLabel>
              <p className="whitespace-pre-line rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 text-sm leading-relaxed">
                {session.description}
              </p>
            </section>
          )}

          <section>
            <SectionLabel className="mb-2 block">Venue</SectionLabel>
            <Link
              href={`/venues/${venue.slug}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-brand-700)] hover:underline"
            >
              <MapPin className="size-3.5" /> {venue.name} · {venue.city}
            </Link>
          </section>

          {!sessionEnded && (
            <section>
              <SectionLabel className="mb-2 block">
                {existingSignupId ? "Your signup" : "Join this session"}
              </SectionLabel>
              {existingSignupId ? (
                <ExistingSignupSummary signupId={existingSignupId} sessionStartAt={session.startAt} />
              ) : !user ? (
                <Alert variant="info" title="Sign in to join">
                  <Link
                    href={`/sign-in?next=${encodeURIComponent(`/open-play/${session.id}`)}`}
                    className="font-medium underline"
                  >
                    Sign in
                  </Link>{" "}
                  to reserve a spot. We&apos;ll hold your slot for 15 minutes once you join.
                </Alert>
              ) : sessionStarted ? (
                <Alert variant="warning" title="Session already started">
                  Sign-ups closed when the session began. Browse other sessions on the Open Play board.
                </Alert>
              ) : spotsLeft === 0 ? (
                <Alert variant="warning" title="Session is full">
                  All spots are taken. Try another upcoming session.
                </Alert>
              ) : (
                <JoinForm
                  sessionId={session.id}
                  totalCentavos={totalPrice}
                  defaultContactEmail={user.email ?? ""}
                />
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row icon={<Calendar className="size-4" />} label="Start" value={formatDateTimeManila(session.startAt)} />
              <Row icon={<Calendar className="size-4" />} label="End" value={formatDateTimeManila(session.endAt)} />
              <Row icon={<Trophy className="size-4" />} label="Skill" value={skillLabel[session.skillLevel] ?? session.skillLevel} />
              <Row
                icon={<MapPin className="size-4" />}
                label={courts.length === 1 ? "Court" : `Courts (${courts.length})`}
                value={courts.map((c) => c.name).join(" · ")}
              />

              <div className="border-t border-[var(--color-border-default)] pt-2">
                <Row label="Court fee" value={formatPHP(session.pricePerPlayerCentavos)} />
                <Row
                  label="Booking fee"
                  value={
                    session.systemFeePerPlayerCentavos === 0n
                      ? "₱0 (promo)"
                      : formatPHP(session.systemFeePerPlayerCentavos)
                  }
                  muted={session.systemFeePerPlayerCentavos === 0n}
                />
                <div className="mt-1 flex items-center justify-between border-t border-[var(--color-border-default)] pt-2">
                  <span className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                    You pay
                  </span>
                  <span className="text-lg font-bold text-[var(--color-brand-700)]">
                    {formatPHP(totalPrice)}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="inline-flex items-center gap-1 text-[var(--color-fg-muted)]">
                    <Users className="size-3" />
                    {activeCount} / {session.capacity} joined
                  </span>
                  <span className="font-medium tabular-nums">{pct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-muted)]">
                  <div
                    className="h-full bg-[var(--color-brand-500)] transition-[width]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </Container>
  );
}

function Row({
  icon,
  label,
  value,
  muted,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="inline-flex items-center gap-1.5 text-[var(--color-fg-muted)]">
        {icon}
        {label}
      </span>
      <span className={muted ? "text-[var(--color-fg-muted)]" : "font-medium"}>{value}</span>
    </div>
  );
}

async function ExistingSignupSummary({
  signupId,
  sessionStartAt,
}: {
  signupId: string;
  sessionStartAt: Date;
}) {
  const signup = await findSignupById(signupId);
  if (!signup) return null;

  if (signup.status === "pending_payment") {
    return (
      <Alert variant="warning" title="Finish your payment">
        <Link
          href={`/open-play/signups/${signup.id}/pay`}
          className="font-semibold underline"
        >
          Pay now
        </Link>{" "}
        to confirm your spot. We&apos;ll hold it for 15 minutes from when you joined.
      </Alert>
    );
  }
  if (signup.status === "payment_submitted") {
    return (
      <Alert variant="info" title="Waiting for venue verification">
        Your receipt has been received. We&apos;ll email you once the venue confirms.
      </Alert>
    );
  }
  if (signup.status === "confirmed") {
    return (
      <Alert variant="success" title="You're in!">
        Show up at {formatDateTimeManila(sessionStartAt)}.{" "}
        <Link href="/me/open-play" className="font-medium underline">
          Manage signup
        </Link>
      </Alert>
    );
  }
  return null;
}
