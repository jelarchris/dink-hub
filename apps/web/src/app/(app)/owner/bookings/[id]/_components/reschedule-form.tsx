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

export interface CourtOption {
  id: string;
  name: string;
  isIndoor: boolean;
  surface: string;
  /** PHP hourly rate as a regular number — safe for JS since court rates are well within safe-integer range. */
  hourlyRateCentavos: number;
}

interface RescheduleFormProps {
  bookingId: string;
  version: number;
  /** Current start time, used as the default to nudge into the picker. */
  currentStartAt: Date;
  /** Current duration in minutes — preserved by default for one-tap reschedule. */
  currentDurationMin: number;
  /** The court this booking is currently on — pre-selected in the court picker. */
  currentCourtId: string;
  /** All active courts in this venue. Pass an array with a single entry to hide the selector. */
  availableCourts: CourtOption[];
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

function formatPesoCents(centavos: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(centavos / 100);
}

export function RescheduleForm({
  bookingId,
  version,
  currentStartAt,
  currentDurationMin,
  currentCourtId,
  availableCourts,
}: RescheduleFormProps) {
  const [state, formAction] = useActionState(rescheduleBookingByOwnerAction, null);
  const [open, setOpen] = useState(false);

  const defaultStart = useMemo(() => toManilaInputValue(currentStartAt), [currentStartAt]);
  const [startLocal, setStartLocal] = useState(defaultStart);
  const [durationMin, setDurationMin] = useState<number>(
    DURATION_OPTIONS.find((d) => d === currentDurationMin) ?? 60,
  );
  const [selectedCourtId, setSelectedCourtId] = useState(currentCourtId);

  // Compute end time on the fly so it stays in sync with start + duration.
  const newStartIso = manilaInputToIso(startLocal);
  const newEndIso = useMemo(() => {
    const startMs = new Date(newStartIso).getTime();
    if (Number.isNaN(startMs)) return "";
    const end = new Date(startMs + durationMin * 60_000);
    return end.toISOString();
  }, [newStartIso, durationMin]);

  // Only show the court picker when there are multiple courts.
  const showCourtPicker = availableCourts.length > 1;
  const isCourtChanged = selectedCourtId !== currentCourtId;
  const newCourt = availableCourts.find((c) => c.id === selectedCourtId);

  // Preview the fee change when the court changes (exact same formula as server).
  const feePreview = isCourtChanged && newCourt
    ? Math.floor((durationMin * newCourt.hourlyRateCentavos) / 60)
    : null;

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
      {/* Only send newCourtId when the court has actually changed. */}
      {isCourtChanged && (
        <input type="hidden" name="newCourtId" value={selectedCourtId} />
      )}

      {state && !state.ok && (
        <Alert variant="danger" title="Could not reschedule">
          {state.message}
        </Alert>
      )}

      {showCourtPicker && (
        <div>
          <Label htmlFor="reschedule-court">Court</Label>
          <Select
            id="reschedule-court"
            value={selectedCourtId}
            onChange={(e) => setSelectedCourtId(e.target.value)}
            className="mt-1"
          >
            {availableCourts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.isIndoor ? "Indoor" : "Outdoor"} · {c.surface}
              </option>
            ))}
          </Select>
          {feePreview !== null && (
            <p className="mt-1 text-xs text-amber-700">
              Court fee will update to{" "}
              <strong>{formatPesoCents(feePreview)}</strong> based on{" "}
              {newCourt?.name}&apos;s rate.
            </p>
          )}
        </div>
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
          placeholder="e.g. Moved to Court 2 — same venue, easier parking."
          className="mt-1"
        />
      </div>

      <p className="text-xs text-[var(--color-fg-muted)]">
        {showCourtPicker
          ? "The player will be notified by email with the updated time and court."
          : "Same court. The player will be notified by email."}
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


