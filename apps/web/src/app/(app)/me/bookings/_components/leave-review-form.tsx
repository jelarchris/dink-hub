"use client";

import { useRef, useState, useTransition } from "react";
import { submitReviewAction } from "@/features/reviews/actions";

interface LeaveReviewFormProps {
  bookingId: string;
  venueName: string;
}

export function LeaveReviewForm({ bookingId, venueName }: LeaveReviewFormProps) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [hovered, setHovered] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (done) {
    return (
      <span className="text-xs font-semibold text-[var(--color-success)]">
        ✓ Review submitted
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-[var(--color-brand-700)] underline-offset-2 hover:underline"
      >
        Leave a review
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    data.set("rating", String(rating));
    startTransition(async () => {
      const res = await submitReviewAction(data);
      if (res.ok) {
        setDone(true);
        setOpen(false);
      } else {
        setError(res.message);
      }
    });
  }

  const displayRating = hovered ?? rating;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="mt-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3"
    >
      <p className="mb-2 text-xs font-semibold">
        Review {venueName}
      </p>

      <input type="hidden" name="bookingId" value={bookingId} />

      {/* Star picker */}
      <div className="mb-3 flex items-center gap-1" aria-label="Select rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            className="p-1.5 transition-transform hover:scale-110 active:scale-95"
          >
            <svg
              width={24}
              height={24}
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <polygon
                points="10,1 12.9,7 19.5,7.6 14.5,12 16.2,18.5 10,15 3.8,18.5 5.5,12 0.5,7.6 7.1,7"
                fill={star <= displayRating ? "var(--color-warning, #f59e0b)" : "var(--color-border-default, #e5e7eb)"}
              />
            </svg>
          </button>
        ))}
        <span className="ml-1 text-xs text-[var(--color-fg-muted)]">
          {displayRating} / 5
        </span>
      </div>

      <textarea
        name="body"
        placeholder="Share your experience (optional)"
        rows={3}
        maxLength={1000}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-bg)] px-2.5 py-2 text-sm placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]"
      />

      {error && <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-[var(--radius-sm)] bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 hover:bg-[var(--color-brand-700)] disabled:opacity-50"
        >
          {isPending ? "Submitting…" : "Submit"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="py-2.5 px-2 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
