import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { Container } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { StarRating } from "@/components/ui/star-rating";
import { listReviewsForOwner } from "@/features/reviews/service";
import { formatDateManila } from "@/lib/date";
import { OwnerReplyForm } from "./_components/owner-reply-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reviews" };

export default async function OwnerReviewsPage() {
  const profile = await getSessionUser();
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent("/owner/reviews")}`);
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return (
      <Container className="py-4">
        <Alert variant="warning" title="Owner access required">
          Your account isn&apos;t set up as a venue owner.
        </Alert>
      </Container>
    );
  }

  const items = await listReviewsForOwner(profile.id);

  return (
    <Container className="py-3 sm:py-4">
      <PageHeader
        kicker="Manage reviews"
        title={`${items.length} review${items.length === 1 ? "" : "s"}`}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title="No reviews yet"
          description="Reviews from players will appear here once they start reviewing your venues."
        />
      ) : (
        <ul className="divide-y divide-[var(--color-border-default)]">
          {items.map((it) => (
            <li key={it.review.id} className="py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{it.playerDisplayName}</span>
                    {it.review.isHidden && (
                      <span className="rounded-full bg-[var(--color-warning-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--color-warning)]">
                        Hidden
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--color-fg-muted)]">
                    <span>{it.venueName}</span>
                    <span>·</span>
                    <span>{formatDateManila(it.review.createdAt)}</span>
                  </div>
                  <StarRating rating={it.review.rating} size={4} />
                  {it.review.body && (
                    <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-fg)]">
                      {it.review.body}
                    </p>
                  )}
                </div>
              </div>

              <OwnerReplyForm
                reviewId={it.review.id}
                existingReply={it.review.ownerReply}
              />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
