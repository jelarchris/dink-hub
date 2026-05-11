"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash2, Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  addCourtClosureAction,
  removeCourtClosureAction,
} from "@/features/owner-venues/actions";
import type { ActionResult } from "@/features/auth";
import type { CourtClosure } from "@/db/schema";

// Manila has no DST — fixed UTC+08:00.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function toManilaInputValue(d: Date): string {
  const manila = new Date(d.getTime() + MANILA_OFFSET_MS);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${manila.getUTCFullYear()}-${pad(manila.getUTCMonth() + 1)}-${pad(manila.getUTCDate())}` +
    `T${pad(manila.getUTCHours())}:${pad(manila.getUTCMinutes())}`
  );
}

function manilaInputToIso(local: string): string {
  return `${local}:00+08:00`;
}

function formatClosureRange(startAt: Date, endAt: Date): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  return `${fmt(startAt)} – ${fmt(endAt)}`;
}

interface CourtClosuresPanelProps {
  courtId: string;
  initialClosures: CourtClosure[];
}

export function CourtClosuresPanel({ courtId, initialClosures }: CourtClosuresPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [closures, setClosures] = useState<CourtClosure[]>(initialClosures);
  const [isPending, startTransition] = useTransition();

  const now = new Date();
  const defaultStart = toManilaInputValue(new Date(now.getTime() + 60 * 60_000)); // +1 hr
  const defaultEnd = toManilaInputValue(new Date(now.getTime() + 2 * 60 * 60_000)); // +2 hr

  const [addState, addAction] = useActionState<ActionResult<never> | null, FormData>(
    async (prev, form) => {
      // Inject ISO-with-offset values before submitting.
      const startLocal = form.get("startLocal") as string | null;
      const endLocal = form.get("endLocal") as string | null;
      if (startLocal) form.set("startAt", manilaInputToIso(startLocal));
      if (endLocal) form.set("endAt", manilaInputToIso(endLocal));
      form.delete("startLocal");
      form.delete("endLocal");
      const result = await addCourtClosureAction(prev, form);
      if (result.ok) {
        // Optimistically close the form; page will revalidate from server.
        setShowForm(false);
      }
      return result;
    },
    null,
  );

  function handleRemove(closureId: string) {
    startTransition(async () => {
      const form = new FormData();
      form.set("closureId", closureId);
      form.set("courtId", courtId);
      await removeCourtClosureAction(null, form);
      setClosures((prev) => prev.filter((c) => c.id !== closureId));
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
          Scheduled closures
        </h2>
        {!showForm && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowForm(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add closure
          </Button>
        )}
      </div>

      {showForm && (
        <form action={addAction} className="mt-3 rounded-lg border border-[var(--color-border-default)] p-4 space-y-3">
          <input type="hidden" name="courtId" value={courtId} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cc-start">Start</Label>
              <Input
                id="cc-start"
                name="startLocal"
                type="datetime-local"
                defaultValue={defaultStart}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cc-end">End</Label>
              <Input
                id="cc-end"
                name="endLocal"
                type="datetime-local"
                defaultValue={defaultEnd}
                required
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="cc-reason">Reason (optional)</Label>
            <Textarea
              id="cc-reason"
              name="reason"
              placeholder="e.g. Court resurfacing, Private event"
              rows={2}
              className="mt-1"
            />
          </div>

          {addState && !addState.ok && (
            <Alert variant="warning" title={addState.message} />
          )}

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
            <SubmitButton size="sm">Save closure</SubmitButton>
          </div>
        </form>
      )}

      {closures.length === 0 && !showForm && (
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
          No closures scheduled. Players can book this court at any time.
        </p>
      )}

      {closures.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--color-border-default)]">
          {closures.map((closure) => (
            <li key={closure.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium tabular-nums">
                  {formatClosureRange(closure.startAt, closure.endAt)}
                </p>
                {closure.reason && (
                  <p className="mt-0.5 text-xs text-[var(--color-fg-muted)] line-clamp-2">
                    {closure.reason}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleRemove(closure.id)}
                className="shrink-0 text-[var(--color-fg-muted)] hover:text-red-600 disabled:opacity-50"
                aria-label="Remove closure"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
