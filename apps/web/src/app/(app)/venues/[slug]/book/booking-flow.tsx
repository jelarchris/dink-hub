"use client";

import { Loader2, Trophy, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { startBookingFormAction } from "@/features/booking/actions";
import { cn } from "@/lib/cn";
import { addMinutes, formatTimeManila, generateDaySlotsManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";

const OPEN_HOUR = 6;
const CLOSE_HOUR = 22;
const SLOT_MINUTES = 60;

export interface BookingFlowProps {
  venueSlug: string;
  days: ReadonlyArray<{ isoDate: string; label: string; isToday: boolean }>;
  courts: ReadonlyArray<{
    id: string;
    name: string;
    surface: string;
    isIndoor: boolean;
    /** bigint serialised — convert with BigInt() before arithmetic. */
    hourlyRateCentavos: string;
    imageUrl: string | null;
  }>;
  /** Occupancy for ALL courts across the full 14-day window. */
  occupancy: ReadonlyArray<{ courtId: string; startAtIso: string; endAtIso: string }>;
}

interface OccupiedRange {
  start: number;
  end: number;
}

export function BookingFlow({
  venueSlug,
  days,
  courts,
  occupancy,
}: BookingFlowProps) {
  const [selectedCourtId, setSelectedCourtId] = useState<string>(courts[0]!.id);
  const [selectedDateIso, setSelectedDateIso] = useState<string>(days[0]!.isoDate);
  const [pickedSlotIso, setPickedSlotIso] = useState<string | null>(null);

  const selectedCourt = courts.find((c) => c.id === selectedCourtId) ?? courts[0]!;
  const hourlyRate = BigInt(selectedCourt.hourlyRateCentavos);
  const slotPriceCentavos = (BigInt(SLOT_MINUTES) * hourlyRate) / 60n;

  // Index occupancy once: courtId -> sorted ranges (millis).
  const occupancyByCourt = useMemo(() => {
    const map = new Map<string, OccupiedRange[]>();
    for (const r of occupancy) {
      const arr = map.get(r.courtId) ?? [];
      arr.push({ start: new Date(r.startAtIso).getTime(), end: new Date(r.endAtIso).getTime() });
      map.set(r.courtId, arr);
    }
    return map;
  }, [occupancy]);

  const slots = useMemo(
    () =>
      generateDaySlotsManila({
        isoDate: selectedDateIso,
        startHour: OPEN_HOUR,
        endHour: CLOSE_HOUR,
      }).filter((d) => d.getMinutes() === 0),
    [selectedDateIso],
  );

  const [now] = useState(() => Date.now());
  const courtRanges = occupancyByCourt.get(selectedCourtId) ?? [];

  function isAvailable(slotStart: Date): boolean {
    const start = slotStart.getTime();
    const end = start + SLOT_MINUTES * 60_000;
    if (start <= now) return false;
    for (const r of courtRanges) {
      if (r.start < end && r.end > start) return false;
    }
    return true;
  }

  const pickedDateLabel =
    days.find((d) => d.isoDate === selectedDateIso)?.label ?? selectedDateIso;
  const pickedSlotDate = pickedSlotIso ? new Date(pickedSlotIso) : null;
  const pickedEndDate = pickedSlotDate ? addMinutes(pickedSlotDate, SLOT_MINUTES) : null;
  const canContinue = pickedSlotIso !== null;

  function pickCourt(id: string): void {
    if (id === selectedCourtId) return;
    setSelectedCourtId(id);
    setPickedSlotIso(null);
  }
  function pickDate(iso: string): void {
    if (iso === selectedDateIso) return;
    setSelectedDateIso(iso);
    setPickedSlotIso(null);
  }

  return (
    <div className="pb-24">
      <Section label="Select court">
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {courts.map((c) => (
            <CourtCard
              key={c.id}
              court={c}
              selected={c.id === selectedCourtId}
              onSelect={() => pickCourt(c.id)}
            />
          ))}
        </div>
      </Section>

      <Section label="Select date">
        <div className="-mx-4 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {days.map((d) => (
            <DateChip
              key={d.isoDate}
              isoDate={d.isoDate}
              label={d.label}
              selected={d.isoDate === selectedDateIso}
              onSelect={() => pickDate(d.isoDate)}
            />
          ))}
        </div>
      </Section>

      <Section label={`Select time · ${pickedDateLabel}`}>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
          {slots.map((s) => {
            const iso = s.toISOString();
            const available = isAvailable(s);
            const isPicked = pickedSlotIso === iso;
            return (
              <button
                key={iso}
                type="button"
                disabled={!available}
                onClick={() => setPickedSlotIso(iso)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border px-2 py-2 text-center transition-colors",
                  isPicked &&
                    "border-[var(--color-brand-500)] bg-[var(--color-brand-50)] ring-2 ring-[var(--color-brand-500)]",
                  !isPicked && available &&
                    "border-[var(--color-border-default)] bg-[var(--color-bg)] hover:border-[var(--color-brand-500)] hover:bg-[var(--color-brand-50)]",
                  !available &&
                    "cursor-not-allowed border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] text-[var(--color-fg-subtle)] opacity-60",
                )}
              >
                <span className="text-sm font-bold leading-tight tracking-tight">
                  {formatTimeManila(s)}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wide leading-none",
                    available
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-fg-subtle)]",
                  )}
                >
                  {available ? formatPHP(slotPriceCentavos) : "Booked"}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border-default)] bg-[var(--color-bg)]/95 px-4 py-3 shadow-[0_-8px_30px_-12px_rgb(0_0_0/_0.15)] backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0 text-xs sm:text-sm">
            {canContinue && pickedSlotDate && pickedEndDate ? (
              <>
                <div className="truncate font-semibold">
                  {selectedCourt.name} · {pickedDateLabel} ·{" "}
                  {formatTimeManila(pickedSlotDate)}–{formatTimeManila(pickedEndDate)}
                </div>
                <div className="text-[var(--color-fg-muted)]">
                  <span className="font-semibold text-[var(--color-brand-700)]">
                    {formatPHP(slotPriceCentavos)}
                  </span>{" "}
                  + system fee
                </div>
              </>
            ) : (
              <div className="text-[var(--color-fg-muted)]">Pick a time to continue</div>
            )}
          </div>
          <form action={startBookingFormAction}>
            <input type="hidden" name="venueSlug" value={venueSlug} />
            <input type="hidden" name="courtId" value={selectedCourtId} />
            <input type="hidden" name="startAt" value={pickedSlotIso ?? ""} />
            <input type="hidden" name="endAt" value={pickedEndDate?.toISOString() ?? ""} />
            <ContinueButton disabled={!canContinue} />
          </form>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
        {label}
      </h2>
      {children}
    </section>
  );
}

function ContinueButton({ disabled }: { disabled: boolean }) {
  // useFormStatus reads the parent <form>'s submission state, so the button
  // flips to a loading state the instant React fires the action — no waiting
  // for the server round-trip + redirect to feel responsive.
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;
  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={pending}
      className={cn(
        "inline-flex h-11 min-w-[120px] items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-5 text-sm font-semibold transition-colors",
        !isDisabled &&
          "bg-[var(--color-brand-500)] text-white shadow-[var(--shadow-md)] hover:bg-[var(--color-brand-600)]",
        pending && "bg-[var(--color-brand-600)] text-white",
        disabled && !pending &&
          "cursor-not-allowed bg-[var(--color-bg-muted)] text-[var(--color-fg-subtle)]",
      )}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
        </>
      ) : (
        "Continue"
      )}
    </button>
  );
}

function CourtCard({
  court,
  selected,
  onSelect,
}: {
  court: BookingFlowProps["courts"][number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex w-[120px] shrink-0 snap-start flex-col overflow-hidden rounded-[var(--radius-md)] border bg-[var(--color-bg)] text-left transition-colors sm:w-[140px]",
        selected
          ? "border-[var(--color-brand-500)] ring-2 ring-[var(--color-brand-500)]"
          : "border-[var(--color-border-default)] hover:border-[var(--color-brand-500)]",
      )}
    >
      <div className="relative aspect-[5/4] w-full bg-gradient-to-br from-[var(--color-brand-300)] to-[var(--color-brand-600)]">
        {court.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={court.imageUrl} alt={court.name} className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/85">
            <Trophy className="size-8" />
          </div>
        )}
        {selected && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-[var(--color-brand-500)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
            <Zap className="size-2.5" /> Selected
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <span className="truncate text-sm font-semibold leading-tight">{court.name}</span>
        <span className="truncate text-[11px] text-[var(--color-fg-muted)]">
          {court.isIndoor ? "Indoor" : "Outdoor"} · {court.surface}
        </span>
        <span className="mt-0.5 text-sm font-bold text-[var(--color-brand-700)]">
          {formatPHP(BigInt(court.hourlyRateCentavos))}
          <span className="ml-0.5 text-[10px] font-medium text-[var(--color-fg-muted)]">/hr</span>
        </span>
      </div>
    </button>
  );
}

function DateChip({
  isoDate,
  label,
  selected,
  onSelect,
}: {
  isoDate: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  const dow = date.toLocaleDateString("en-PH", { weekday: "short", timeZone: "UTC" });
  const dayNum = date.getUTCDate();
  const mon = date.toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" });
  const isToday = label === "Today";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-[54px] shrink-0 snap-start flex-col items-center justify-center rounded-[var(--radius-md)] border px-1 py-1.5 text-center transition-colors sm:w-[60px]",
        selected
          ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)] text-white"
          : "border-[var(--color-border-default)] bg-[var(--color-bg)] text-[var(--color-fg)] hover:border-[var(--color-brand-500)]",
      )}
    >
      <span
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wide",
          selected ? "text-white/85" : "text-[var(--color-fg-muted)]",
        )}
      >
        {dow}
      </span>
      <span className="text-lg font-extrabold leading-tight">{dayNum}</span>
      <span
        className={cn(
          "text-[10px] uppercase",
          selected ? "text-white/85" : "text-[var(--color-fg-muted)]",
        )}
      >
        {mon}
      </span>
      {isToday && (
        <span
          aria-hidden
          className={cn(
            "mt-0.5 size-1 rounded-full",
            selected ? "bg-white" : "bg-[var(--color-brand-500)]",
          )}
        />
      )}
    </button>
  );
}
