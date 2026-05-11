"use client";

import { useActionState, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
// Direct import — never import from the feature barrel in a client component.
import { rescheduleBookingByOwnerAction } from "@/features/owner-venues/actions";

interface RescheduleFormProps {
  bookingId: string;
  version: number;
  /** Current start time, used as the default to nudge into the picker. */
  currentStartAt: Date;
  /** Current duration in minutes — preserved by default for one-tap reschedule. */
  currentDurationMin: number;
}

/**
 * Manila has no DST → fixed UTC+08:00. We render the input in Manila wall-clock
 * and round-trip the value as an ISO string with an explicit `+08:00` offset.
 *
 * Slot rules (mirrored on server via Zod): 30-min grain, 30 min ≤ duration ≤ 4 h.
 */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180, 210, 240] as const;

function toManilaInputValue(d: Date): string {
  // Convert UTC instant → Manila wall-clock string in `YYYY-MM-DDTHH:mm` form
  // (the format <input type="datetime-local"> expects).
  const manila = new Date(d.getTime() + MANILA_OFFSET_MS);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${manila.getUTCFullYear()}-${pad(manila.getUTCMonth() + 1)}-${pad(manila.getUTCDate())}` +
    `T${pad(manila.getUTCHours())}:${pad(manila.getUTCMinutes())}`
  );
}

function manilaInputToIso(local: string): string {
  // Treat the wall-clock value as Manila time; emit ISO with +08:00 offset.
  return `${local}:00+08:00`;
}

export function RescheduleForm({
  bookingId,
  version,
  currentStartAt,
  currentDurationMin,
}: RescheduleFormProps) {
  const [state, formAction] = useActionState(rescheduleBookingByOwnerAction, null);
  const [open, setOpen] = useState(false);

  const defaultStart = useMemo(() => toManilaInputValue(currentStartAt), [currentStartAt]);
  const [startLocal, setStartLocal] = useState(defaultStart);
  const [durationMin, setDurationMin] = useState<number>(
    DURATION_OPTIONS.find((d) => d === currentDurationMin) ?? 60,
  );

  // Compute end time on the fly so it stays in sync with start + duration.
  const newStartIso = manilaInputToIso(startLocal);
  const newEndIso = useMemo(() => {
    const startMs = new Date(newStartIso).getTime();
    if (Number.isNaN(startMs)) return "";
    const end = new Date(startMs + durationMin * 60_000);
    return end.toISOString();
  }, [newStartIso, durationMin]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-[var(--color-brand-700)] hover:underline"
      >
        Reschedule…
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="newStartAt" value={newStartIso} />
      <input type="hidden" name="newEndAt" value={newEndIso} />

      {state && !state.ok && (
        <Alert variant="danger" title="Could not reschedule">
          {state.message}
        </Alert>
      )}

      <div>
        <Label htmlFor="reschedule-start">New start (Manila time)</Label>
        <Input
          id="reschedule-start"
          type="datetime-local"
          step={1800 /* 30-minute grain */}
          required
          value={startLocal}
          onChange={(e) => setStartLocal(e.target.value)}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="reschedule-duration">Duration</Label>
        <Select
          id="reschedule-duration"
          value={durationMin}
          onChange={(e) => setDurationMin(Number(e.target.value))}
          className="mt-1"
        >
          {DURATION_OPTIONS.map((min) => (
            <option key={min} value={min}>
              {min < 60
                ? `${min} min`
                : min % 60 === 0
                  ? `${min / 60} h`
                  : `${Math.floor(min / 60)} h ${min % 60} min`}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="reschedule-reason">Note to player (optional)</Label>
        <Textarea
          id="reschedule-reason"
          name="reason"
          maxLength={500}
          rows={2}
          placeholder="e.g. Moved to 5pm so we can fit a tournament block."
          className="mt-1"
        />
      </div>

      <p className="text-xs text-[var(--color-fg-muted)]">
        Same court only. The player will be notified by email.
      </p>

      <div className="flex items-center gap-2">
        <SubmitButton size="sm" pendingLabel="Rescheduling…">
          Confirm reschedule
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-[var(--color-fg-muted)] hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
