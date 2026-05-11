import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin, Trophy } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { StarRating } from "@/components/ui/star-rating";
import { findActiveVenueBySlug } from "@/features/venues";
import { getVenueRating, listReviewsForVenue } from "@/features/reviews/service";
import { venueMediaPublicUrl } from "@/lib/venue-media";
import { formatPHP } from "@/lib/money";
import { formatDateManila } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await findActiveVenueBySlug(slug);
  return {
    title: found ? found.venue.name : "Venue not found",
    description: found?.venue.description ?? undefined,
  };
}

export default async function VenuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await findActiveVenueBySlug(slug);
  if (!found) notFound();
  const { venue, courts } = found;

  const [ratingStats, reviewItems] = await Promise.all([
    getVenueRating(venue.id),
    listReviewsForVenue(venue.id, 10),
  ]);

  const minRate = courts.reduce<bigint | null>((acc, c) => {
    const r = c.hourlyRateCentavos;
    return acc === null || r < acc ? r : acc;
  }, null);

  const hasCourts = courts.length > 0;
  const bookHref = `/venues/${venue.slug}/book`;

  return (
    <Container className="py-3 pb-28 sm:py-5 lg:pb-8">
      <Link
        href="/venues"
        className="mb-2 inline-flex items-center gap-1 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-3.5" /> All venues
      </Link>

      {/* Hero */}
      <div className="relative h-44 w-full overflow-hidden rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--color-brand-300)] via-[var(--color-brand-500)] to-[var(--color-accent-500)] sm:h-60">
        {venue.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={venue.coverImageUrl} alt={venue.name} className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 text-white">
          <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--color-success)]/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Open
          </span>
          <h1 className="text-xl font-bold leading-tight drop-shadow sm:text-3xl">{venue.name}</h1>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs drop-shadow sm:text-sm">
            <MapPin className="size-3.5" />
            {venue.city}, {venue.province}
          </p>
        </div>
      </div>

      {/* Primary CTA + summary — directly under hero, above the fold */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-default)] pb-4">
        <div className="flex items-baseline gap-3 text-sm">
          <div>
            <span className="text-2xl font-extrabold tracking-tight text-[var(--color-brand-700)]">
              {minRate !== null ? formatPHP(minRate) : "—"}
            </span>
            <span className="ml-1 text-xs text-[var(--color-fg-muted)]">/ hr</span>
          </div>
          <div className="text-[var(--color-fg-muted)]">·</div>
          <div className="text-[var(--color-fg-muted)]">
            <span className="font-semibold text-[var(--color-fg)]">{courts.length}</span>{" "}
            {courts.length === 1 ? "court" : "courts"}
          </div>
          {ratingStats && (
            <>
              <div className="text-[var(--color-fg-muted)]">·</div>
              <div className="flex items-center gap-1">
                <StarRating rating={ratingStats.avgRating} size={4} />
                <span className="text-xs font-semibold text-[var(--color-fg)]">
                  {ratingStats.avgRating.toFixed(1)}
                </span>
                <span className="text-xs text-[var(--color-fg-muted)]">
                  ({ratingStats.reviewCount})
                </span>
              </div>
            </>
          )}
        </div>
        {hasCourts ? (
          <Link
            href={bookHref}
            className={`${buttonVariants({ size: "lg" })} min-w-[180px] justify-center`}
          >
            Book a court <ArrowRight className="size-4" />
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className={`${buttonVariants({ size: "lg" })} min-w-[180px] cursor-not-allowed justify-center opacity-50`}
          >
            No courts available
          </button>
        )}
      </div>

      {/* Compact details — no boxes */}
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)] sm:pt-0.5">
          Address
        </dt>
        <dd className="text-[var(--color-fg)]">{venue.addressLine}</dd>
      </dl>

      {venue.description && (
        <section className="mt-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
            About
          </h2>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-[var(--color-fg)]">
            {venue.description}
          </p>
        </section>
      )}

      {/* Courts — minimal cards (image + info, no chrome) */}
      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
            Courts ({courts.length})
          </h2>
          {hasCourts && (
            <Link
              href={bookHref}
              className="text-xs font-semibold text-[var(--color-brand-700)] hover:underline"
            >
              See availability →
            </Link>
          )}
        </div>
        {!hasCourts ? (
          <p className="text-sm text-[var(--color-fg-muted)]">No active courts yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courts.map((c) => {
              const img = venueMediaPublicUrl(c.imagePath);
              return (
                <li key={c.id} className="overflow-hidden rounded-[var(--radius-md)]">
                  <div className="relative aspect-[5/3] w-full bg-gradient-to-br from-[var(--color-brand-300)] to-[var(--color-brand-600)]">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-white/85">
                        <Trophy className="size-7" />
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold leading-tight">{c.name}</div>
                      <div className="text-[11px] text-[var(--color-fg-muted)]">
                        {c.isIndoor ? "Indoor" : "Outdoor"} · {c.surface}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-[var(--color-brand-700)]">
                      {formatPHP(c.hourlyRateCentavos)}
                      <span className="ml-0.5 text-[10px] font-medium text-[var(--color-fg-muted)]">/hr</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Reviews */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
          Reviews{ratingStats ? ` · ${ratingStats.reviewCount}` : ""}
        </h2>
        {ratingStats && (
          <div className="mt-1 flex items-center gap-2">
            <StarRating rating={ratingStats.avgRating} size={5} />
            <span className="text-lg font-bold">{ratingStats.avgRating.toFixed(1)}</span>
            <span className="text-sm text-[var(--color-fg-muted)]">out of 5</span>
          </div>
        )}
        {reviewItems.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-fg-muted)]">No reviews yet. Be the first after your booking!</p>
        ) : (
          <ul className="mt-4 space-y-5">
            {reviewItems.map(({ review, playerDisplayName }) => (
              <li key={review.id} className="border-b border-[var(--color-border-default)] pb-5 last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StarRating rating={review.rating} size={3.5} />
                      <span className="text-[11px] text-[var(--color-fg-muted)]">
                        {formatDateManila(review.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs font-semibold text-[var(--color-fg-muted)]">
                      {playerDisplayName}
                    </p>
                  </div>
                </div>
                {review.body && (
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--color-fg)]">
                    {review.body}
                  </p>
                )}
                {review.ownerReply && (
                  <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] px-3 py-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
                      Venue reply
                    </p>
                    <p className="whitespace-pre-line text-sm text-[var(--color-fg)]">{review.ownerReply}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Mobile sticky CTA — only shows on small screens; large screens already have the inline button */}
      {hasCourts && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border-default)] bg-[var(--color-bg)]/95 px-4 py-3 backdrop-blur lg:hidden">
          <Link
            href={bookHref}
            className={`${buttonVariants({ size: "lg" })} flex w-full items-center justify-center`}
          >
            Book a court · from {minRate !== null ? formatPHP(minRate) : "—"}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      )}
    </Container>
  );
}
