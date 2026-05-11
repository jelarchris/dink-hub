"use client";

import { useState, useTransition } from "react";
import { ownerReplyAction } from "@/features/reviews/actions";

interface OwnerReplyFormProps {
  reviewId: string;
  existingReply: string | null;
}

export function OwnerReplyForm({ reviewId, existingReply }: OwnerReplyFormProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (existingReply) {
    return (
      <div className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-bg)] px-3 py-2 text-xs">
        <p className="mb-0.5 font-semibold text-[var(--color-fg-muted)]">Your reply:</p>
        <p className="whitespace-pre-line text-[var(--color-fg)]">{existingReply}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-semibold text-[var(--color-brand-700)] underline-offset-2 hover:underline"
      >
        Reply to review
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await ownerReplyAction(data);
      if (!res.ok) {
        setError(res.message);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2">
      <input type="hidden" name="reviewId" value={reviewId} />
      <textarea
        name="reply"
        placeholder="Write a reply…"
        rows={3}
        maxLength={1000}
        required
        className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-bg)] px-2.5 py-2 text-sm placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]"
      />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-[var(--radius-sm)] bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-brand-700)] disabled:opacity-50"
        >
          {isPending ? "Posting…" : "Post reply"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
