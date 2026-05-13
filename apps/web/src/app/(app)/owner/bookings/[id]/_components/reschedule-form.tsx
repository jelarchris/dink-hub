"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { formatTimeManila, generateDaySlotsManila } from "@/lib/date";
// Direct import — never import from the feature barrel in a client component.
import {
  getCourtOccupancyForRescheduleAction,
  rescheduleBookingByOwnerAction,
} from "@/features/owner-venues/actions";

export interface CourtOption {
  id: string;
  name: string;
  isIndoor: boolean;
  surface: string;
  hourlyRateCentavos: number;
}

interface RescheduleFormProps {
  bookingId: string;
  version: number;
  currentStartAt: Date;
  currentDurationMin: number;
  currentCourtId: string;
  availableCourts: CourtOption[];
}

interface OccupiedRange {
  start: number;
  end: number;
  kind: "booking" | "hold" | "closure";
}

const SLOT_MINUTES = 60;
const OPEN_HOUR = 6;
const CLOSE_HOUR = 22;
const DURATION_OPTIONS = [60, 120, 180, 240] as const;
const MANILA_OFFSET_MS = 8 * 3_600_000;

function toManilaDateIso(d: Date): string {
  const manila = new Date(d.getTime() + MANILA_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(manila.getUTCFullYear())}-${pad(manila.getUTCMonth() + 1)}-${pad(manila.getUTCDate())}`;
}

function toManilaOffsetIso(d: Date): string {
  const manila = new Date(d.getTime() + MANILA_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${String(manila.getUTCFullYear())}-${pad(manila.getUTCMonth() + 1)}-${pad(manila.getUTCDate())}` +
    `T${pad(manila.getUTCHours())}:${pad(manila.getUTCMinutes())}:00+08:00`
  );
}

function formatPesoCents(centavos: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    centavos / 100,
  );
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
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [selectedCourtId, setSelectedCourtId] = useState(currentCourtId);
  const [selectedDateIso, setSelectedDateIso] = useState(() => toManilaDateIso(currentStartAt));
  const [selectedStartIso, setSelectedStartIso] = useState<string | null>(null);
  const [durationMin, setDurationMin] = useState<number>(
    (DURATION_OPTIONS as readonly number[]).includes(currentDurationMin)
      ? currentDurationMin
      : 60,
  );
  const [occupancy, setOccupancy] = useState<OccupiedRange[]>([]);

  // ---------------------------------------------------------------------------
  // Slot loading — triggered by user actions, no useEffect
  // ---------------------------------------------------------------------------

  function loadOccupancy(courtId: string, dateIso: string) {
    startTransition(async () => {
      const rows = await getCourtOccupancyForRescheduleAction(courtId, dateIso);
      setOccupancy(
        rows.map((r) => ({
          start: new Date(r.startAtIso).getTime(),
          end: new Date(r.endAtIso).getTime(),
          kind: r.kind,
        })),
      );
    });
  }

  function handleOpen() {
    setOpen(true);
    loadOccupancy(selectedCourtId, selectedDateIso);
  }

  function handleCourtChange(courtId: string) {
    setSelectedCourtId(courtId);
    setSelectedStartIso(null);
    loadOccupancy(courtId, selectedDateIso);
  }

  function handleDateChange(dateIso: string) {
    setSelectedDateIso(dateIso);
    setSelectedStartIso(null);
    loadOccupancy(selectedCourtId, dateIso);
  }

  // ---------------------------------------------------------------------------
  // Slot availability
  // ---------------------------------------------------------------------------

  const slots = useMemo(
    () =>
      generateDaySlotsManila({
        isoDate: selectedDateIso,
        startHour: OPEN_HOUR,
        endHour: CLOSE_HOUR,
      }).filter((d) => d.getMinutes() === 0),
    [selectedDateIso],
  );

  const [nowMs] = useState(() => Date.now());

  function isSlotFree(slotStart: Date): boolean {
    const s = slotStart.getTime();
    if (s <= nowMs) return false;
    const e = s + SLOT_MINUTES * 60_000;
    return !occupancy.some((r) => r.start < e && r.end > s);
  }

  // Warn if the chosen duration extends into a taken slot beyond the start hour.
  const selectedStartMs = selectedStartIso ? new Date(selectedStartIso).getTime() : null;
  const durationConflict =
    selectedStartMs !== null &&
    durationMin > SLOT_MINUTES &&
    occupancy.some(
      (r) =>
        r.start < selectedStartMs + durationMin * 60_000 &&
        r.end > selectedStartMs + SLOT_MINUTES * 60_000,
    );

  // ---------------------------------------------------------------------------
  // Derived form values
  // ---------------------------------------------------------------------------

  const newStartIso = selectedStartIso ? toManilaOffsetIso(new Date(selectedStartIso)) : "";
  const newEndIso =
    selectedStartMs !== null
      ? toManilaOffsetIso(new Date(selectedStartMs + durationMin * 60_000))
      : "";

  const isCourtChanged = selectedCourtId !== currentCourtId;
  const newCourt = availableCourts.find((c) => c.id === selectedCourtId);
  const feePreview =
    isCourtChanged && newCourt
      ? Math.floor((durationMin * newCourt.hourlyRateCentavos) / 60)
      : null;

  const showCourtPicker = availableCourts.length > 1;
  const todayIso = toManilaDateIso(new Date());
  const canSubmit = selectedStartIso !== null && !durationConflict;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="text-sm font-semibold text-[var(--color-brand-700)] hover:underline"
      >
        Reschedule…
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="newStartAt" value={newStartIso} />
      <input type="hidden" name="newEndAt" value={newEndIso} />
      {isCourtChanged && <input type="hidden" name="newCourtId" value={selectedCourtId} />}

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
            onChange={(e) => handleCourtChange(e.target.value)}
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
              Court fee will update to <strong>{formatPesoCents(feePreview)}</strong> based on{" "}
              {newCourt?.name}&apos;s rate.
            </p>
          )}
        </div>
      )}

      {/* Date picker */}
      <div>
        <Label htmlFor="reschedule-date">Date</Label>
        <input
          id="reschedule-date"
          type="date"
          min={todayIso}
          value={selectedDateIso}
          onChange={(e) => {
            if (e.target.value) handleDateChange(e.target.value);
          }}
          className="mt-1 block w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]"
        />
      </div>

      {/* 1-hour slot grid */}
      <div>
        <Label>Start time</Label>
        {isPending ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-brand-500)] border-t-transparent" />
            Loading availability…
          </div>
        ) : (
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {slots.map((slot) => {
              const slotIso = slot.toISOString();
              const free = isSlotFree(slot);
              const isSelected = selectedStartIso === slotIso;
              const isClosure =
                !free &&
                occupancy.some(
                  (r) =>
                    r.kind === "closure" &&
                    r.start < slot.getTime() + SLOT_MINUTES * 60_000 &&
                    r.end > slot.getTime(),
                );
              return (
                <button
                  key={slotIso}
                  type="button"
                  disabled={!free}
                  onClick={() => setSelectedStartIso(isSelected ? null : slotIso)}
                  className={cn(
                    "rounded-[var(--radius-md)] border px-2 py-2 text-center text-sm font-semibold transition-colors",
                    isSelected &&
                      "border-[var(--color-brand-500)] bg-[var(--color-brand-50)] ring-2 ring-[var(--color-brand-500)] text-[var(--color-brand-700)]",
                    !isSelected &&
                      free &&
                      "border-[var(--color-border-default)] bg-[var(--color-bg)] hover:border-[var(--color-brand-500)] hover:bg-[var(--color-brand-50)]",
                    !free &&
                      "cursor-not-allowed border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] text-[var(--color-fg-subtle)] opacity-60",
                  )}
                >
                  <span className="block leading-tight">
                    {formatTimeManila(slot)} – {formatTimeManila(new Date(slot.getTime() + SLOT_MINUTES * 60_000))}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[10px] font-bold uppercase tracking-wide leading-none",
                      free ? "text-[var(--color-success)]" : "text-[var(--color-fg-subtle)]",
                    )}
                  >
                    {free ? "Free" : isClosure ? "Closed" : "Booked"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Duration */}
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
              {min / 60} hr
            </option>
          ))}
        </Select>
      </div>

      {durationConflict && (
        <Alert variant="warning" title="Slot not fully available">
          Another booking overlaps the {durationMin / 60}-hour window. Choose a different start
          time or a shorter duration.
        </Alert>
      )}

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
        <SubmitButton size="sm" disabled={!canSubmit} pendingLabel="Rescheduling…">
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
