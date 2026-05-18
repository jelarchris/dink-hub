import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Calendar, ExternalLink, MapPin, Trophy, Users } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, SectionLabel } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { formatDateTimeManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";
import {
  findSessionWithVenue,
  listSignupsForSession,
  type SignupListItem,
} from "@/features/open-play";
import { PublishButton, CancelSessionButton, VerifyPaymentButton, RejectPaymentButton } from "./owner-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return { title: `Open Play · ${sessionId.slice(0, 8)}` };
}

const skillLabel: Record<string, string> = {
  any: "All skill levels",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export default async function OwnerOpenPlaySessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const profile = await getSessionUser();
  if (!profile) {
    redirect(`/sign-in?next=${encodeURIComponent(`/owner/open-play/${sessionId}`)}`);
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

  const detail = await findSessionWithVenue(sessionId);
  if (!detail) notFound();

  const { session, venue, court } = detail;
  if (venue.ownerId !== profile.id && profile.role !== "admin") {
    return (
      <Container className="py-4">
        <Alert variant="warning" title="Not your session">
          You don&apos;t have access to this Open Play session.
        </Alert>
      </Container>
    );
  }

  const signups = await listSignupsForSession(session.id);
  const activeSignups = signups.filter(
    (s) => s.signup.status !== "cancelled" && s.signup.status !== "expired",
  );
  const pendingVerification = signups.filter(
    (s) =>
      s.signup.status === "payment_submitted" &&
      (s.paymentStatus === "submitted" || s.paymentStatus === "disputed"),
  );

  const pct = Math.min(100, Math.round((activeSignups.length / session.capacity) * 100));
  const cancellable = session.status === "draft" || session.status === "published";

  return (
    <Container className="max-w-5xl py-3 sm:py-4">
      <PageHeader
        back={{ href: `/owner/venues/${venue.id}/open-play`, label: "Open Play" }}
        kicker="Open Play"
        title={session.title}
        subtitle={`${venue.name} · ${court.name}`}
        action={<SessionStatusBadge status={session.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {session.status === "draft" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ready to publish?</CardTitle>
                <CardDescription>
                  Publishing locks the court for {formatDateTimeManila(session.startAt)} – {formatDateTimeManila(session.endAt)} and lists this session on the public Open Play board. You can cancel any time before play starts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PublishButton sessionId={session.id} />
              </CardContent>
            </Card>
          )}

          {session.status === "cancelled" && (
            <Alert variant="warning" title="Session cancelled">
              {session.cancellationReason ?? "This session was cancelled. All players have been notified."}
            </Alert>
          )}

          <section>
            <SectionLabel className="mb-2 inline-flex items-center gap-1.5">
              <Users className="size-3.5" /> Roster ({activeSignups.length}/{session.capacity})
            </SectionLabel>

            {pendingVerification.length > 0 && (
              <Alert variant="info" className="mb-3">
                <strong>{pendingVerification.length}</strong> payment{pendingVerification.length === 1 ? "" : "s"} waiting for your verification.
              </Alert>
            )}

            {signups.length === 0 ? (
              <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-6 text-center text-sm text-[var(--color-fg-muted)]">
                No signups yet. Share the link once you publish.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border-default)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)]">
                {signups.map((s) => (
                  <RosterRow key={s.signup.id} row={s} />
                ))}
              </ul>
            )}
          </section>
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
              <Row icon={<Users className="size-4" />} label="Capacity" value={`${session.capacity} players`} />
              <Row icon={<MapPin className="size-4" />} label="Court" value={court.name} />
              <div className="mt-2 border-t border-[var(--color-border-default)] pt-2">
                <Row label="Price / player" value={formatPHP(session.pricePerPlayerCentavos)} />
                <Row label="Booking fee / player" value={formatPHP(session.systemFeePerPlayerCentavos)} muted />
                <Row label="Player pays" value={formatPHP(session.pricePerPlayerCentavos + session.systemFeePerPlayerCentavos)} strong />
              </div>
              <div className="pt-2">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-[var(--color-fg-muted)]">Filled</span>
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

          {session.status === "published" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Share</CardTitle>
                <CardDescription>Send this link to invite players directly.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(() => {
                  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
                  const path = `/open-play/${session.id}`;
                  const fullUrl = `${base}${path}`;
                  return (
                    <>
                      <div className="flex items-center gap-1.5">
                        <code className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-2 py-1.5 font-mono text-xs text-[var(--color-fg)]">
                          {fullUrl || path}
                        </code>
                        <CopyButton value={fullUrl || path} label="share link" size="sm" />
                      </div>
                      <Link
                        href={path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
                      >
                        <ExternalLink className="size-3.5" /> Preview public page
                      </Link>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {cancellable && <CancelSessionButton sessionId={session.id} />}
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
  strong,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="inline-flex items-center gap-1.5 text-[var(--color-fg-muted)]">
        {icon}
        {label}
      </span>
      <span
        className={
          strong
            ? "font-bold text-[var(--color-brand-700)]"
            : muted
              ? "text-[var(--color-fg-muted)]"
              : "font-medium"
        }
      >
        {value}
      </span>
    </div>
  );
}

function RosterRow({ row }: { row: SignupListItem }) {
  const { signup, player } = row;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{player.displayName}</div>
        <div className="truncate text-xs text-[var(--color-fg-muted)]">{player.email}</div>
      </div>
      <div className="flex items-center gap-2">
        <SignupStatusBadge status={signup.status} />
        {signup.status === "payment_submitted" && row.paymentId && (
          <>
            <VerifyPaymentButton paymentId={row.paymentId} />
            <RejectPaymentButton paymentId={row.paymentId} />
          </>
        )}
      </div>
    </li>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: Parameters<typeof Badge>[0]["variant"] }> = {
    draft: { label: "Draft", variant: "neutral" },
    published: { label: "Published", variant: "success" },
    cancelled: { label: "Cancelled", variant: "danger" },
    completed: { label: "Completed", variant: "info" },
  };
  const m = map[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function SignupStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: Parameters<typeof Badge>[0]["variant"] }> = {
    pending_payment: { label: "Pending payment", variant: "warning" },
    payment_submitted: { label: "Awaiting verification", variant: "info" },
    confirmed: { label: "Confirmed", variant: "success" },
    cancelled: { label: "Cancelled", variant: "neutral" },
    expired: { label: "Expired", variant: "neutral" },
    refunded: { label: "Refunded", variant: "neutral" },
  };
  const m = map[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
