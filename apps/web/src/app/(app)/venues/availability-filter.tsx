"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, SlidersHorizontal, Timer, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  buildDateChips,
  DEFAULT_DURATION,
  DEFAULT_END_H,
  DEFAULT_START_H,
  DURATION_OPTIONS,
  TIME_SLIDER_MAX,
  TIME_SLIDER_MIN,
  formatHour,
  type AvailabilityFilter,
} from "@/features/venues/availability";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AvailabilityFilterBarProps {
  /** YYYY-MM-DD in Asia/Manila — computed server-side to avoid hydration mismatch. */
  today: string;
  /** Active filter parsed from URL params (null = no availability filter applied). */
  activeFilter: AvailabilityFilter | null;
  /** Current URL params to preserve on navigation. */
  currentQ?: string;
  currentCity?: string;
  currentSort?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildVenuesUrl(params: {
  q?: string;
  city?: string;
  sort?: string;
  date?: string;
  sh?: string;
  eh?: string;
  dur?: string;
}): string {
  const p = new URLSearchParams();
  if (params.q) p.set("q", params.q);
  if (params.city) p.set("city", params.city);
  if (params.sort && params.sort !== "name") p.set("sort", params.sort);
  if (params.date) p.set("date", params.date);
  if (params.sh) p.set("sh", params.sh);
  if (params.eh) p.set("eh", params.eh);
  if (params.dur) p.set("dur", params.dur);
  const qs = p.toString();
  return qs ? `/venues?${qs}` : "/venues";
}

function formatActiveLabel(filter: AvailabilityFilter, today: string): string {
  const timeLabel = `${formatHour(filter.startH)}–${formatHour(filter.endH)}`;
  const durLabel =
    DURATION_OPTIONS.find((o) => o.value === filter.durationMin)?.label ??
    `${filter.durationMin} min`;

  let dateLabel: string;
  const [, , dayStr] = filter.date.split("-");
  const day = Number(dayStr);
  if (filter.date === today) {
    dateLabel = "Today";
  } else {
    const [y, m, d] = filter.date.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!, 4));
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      weekday: "short",
    }).format(dt);
    dateLabel = `${wd} ${day}`;
  }

  return `${timeLabel} · ${dateLabel} · ${durLabel}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChipButton({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-1",
        active
          ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white"
          : "border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] text-[var(--color-fg)] hover:border-[var(--color-brand-400)] hover:bg-[var(--color-bg-muted)]",
        className,
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-fg-muted)]">
      {children}
    </p>
  );
}

/**
 * Dual-handle time range slider built from two overlapping <input type="range">
 * elements — no extra dependency. The left thumb controls startH, right thumb
 * controls endH. The filled track segment is drawn via a CSS linear-gradient on
 * the wrapper div; the individual inputs have transparent tracks.
 */
function TimeRangeSlider({
  startH,
  endH,
  onChangeStart,
  onChangeEnd,
}: {
  startH: number;
  endH: number;
  onChangeStart: (h: number) => void;
  onChangeEnd: (h: number) => void;
}) {
  const range = TIME_SLIDER_MAX - TIME_SLIDER_MIN;
  const startPct = ((startH - TIME_SLIDER_MIN) / range) * 100;
  const endPct = ((endH - TIME_SLIDER_MIN) / range) * 100;

  const trackStyle: React.CSSProperties = {
    background: `linear-gradient(
      to right,
      var(--color-bg-muted) ${startPct}%,
      var(--color-brand-500) ${startPct}%,
      var(--color-brand-500) ${endPct}%,
      var(--color-bg-muted) ${endPct}%
    )`,
  };

  // Shared Tailwind classes for each range input. Track is transparent so
  // only the custom gradient above shows. Only the thumb gets pointer-events
  // so both inputs can receive clicks even though they overlap.
  const inputCls =
    "pointer-events-none absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent " +
    // Webkit thumb
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 " +
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full " +
    "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--color-brand-600)] " +
    "[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm " +
    // Firefox thumb
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 " +
    "[&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full " +
    "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--color-brand-600)] " +
    "[&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-sm " +
    // Hide tracks; the gradient div is the visual track
    "[&::-webkit-slider-runnable-track]:bg-transparent " +
    "[&::-moz-range-track]:bg-transparent " +
    "focus-visible:outline-none focus-visible:ring-0";

  return (
    <div className="space-y-3">
      {/* Track + thumbs */}
      <div
        className="relative h-1.5 w-full rounded-full"
        style={trackStyle}
      >
        {/* Start handle */}
        <input
          type="range"
          min={TIME_SLIDER_MIN}
          max={TIME_SLIDER_MAX - 1}
          value={startH}
          aria-label={`Start time: ${formatHour(startH)}`}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v < endH) onChangeStart(v);
          }}
          className={inputCls}
        />
        {/* End handle */}
        <input
          type="range"
          min={TIME_SLIDER_MIN + 1}
          max={TIME_SLIDER_MAX}
          value={endH}
          aria-label={`End time: ${formatHour(endH)}`}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v > startH) onChangeEnd(v);
          }}
          className={inputCls}
        />
      </div>

      {/* Min / selected range / max labels */}
      <div className="flex items-center justify-between text-[10px] text-[var(--color-fg-muted)]">
        <span>{formatHour(TIME_SLIDER_MIN)}</span>
        <span className="rounded-full bg-[var(--color-brand-50,#eff6ff)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand-700)]">
          {formatHour(startH)} – {formatHour(endH)}
        </span>
        <span>{formatHour(TIME_SLIDER_MAX)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AvailabilityFilterBar({
  today,
  activeFilter,
  currentQ,
  currentCity,
  currentSort,
}: AvailabilityFilterBarProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);

  // Local selection state — initialised from URL on mount.
  const [selectedDate, setSelectedDate] = useState<string>(
    activeFilter?.date ?? today,
  );
  const [selectedStartH, setSelectedStartH] = useState<number>(
    activeFilter?.startH ?? DEFAULT_START_H,
  );
  const [selectedEndH, setSelectedEndH] = useState<number>(
    activeFilter?.endH ?? DEFAULT_END_H,
  );
  const [selectedDuration, setSelectedDuration] = useState<30 | 60 | 90 | 120>(
    activeFilter?.durationMin ?? DEFAULT_DURATION,
  );

  const dateChips = useMemo(() => buildDateChips(today), [today]);

  const handleOpen = useCallback(() => {
    // Re-sync selections to active filter (or defaults) each time panel opens.
    setSelectedDate(activeFilter?.date ?? today);
    setSelectedStartH(activeFilter?.startH ?? DEFAULT_START_H);
    setSelectedEndH(activeFilter?.endH ?? DEFAULT_END_H);
    setSelectedDuration(activeFilter?.durationMin ?? DEFAULT_DURATION);
    setIsOpen(true);
  }, [activeFilter, today]);

  const handleClose = useCallback(() => setIsOpen(false), []);

  const handleFind = useCallback(() => {
    router.push(
      buildVenuesUrl({
        ...(currentQ ? { q: currentQ } : {}),
        ...(currentCity ? { city: currentCity } : {}),
        ...(currentSort && currentSort !== "name" ? { sort: currentSort } : {}),
        date: selectedDate,
        sh: String(selectedStartH),
        eh: String(selectedEndH),
        dur: String(selectedDuration),
      }),
    );
    setIsOpen(false);
  }, [currentQ, currentCity, currentSort, selectedDate, selectedStartH, selectedEndH, selectedDuration, router]);

  const handleClear = useCallback(() => {
    router.push(
      buildVenuesUrl({
        ...(currentQ ? { q: currentQ } : {}),
        ...(currentCity ? { city: currentCity } : {}),
        ...(currentSort && currentSort !== "name" ? { sort: currentSort } : {}),
      }),
    );
    setIsOpen(false);
  }, [currentQ, currentCity, currentSort, router]);

  const panelId = "availability-filter-panel";

  return (
    <div className="mt-3">
      {/* ── Trigger row ── */}
      <div className="flex items-center gap-2">
        {activeFilter ? (
          /* Active state: pill showing current filter + ✕ to clear */
          <div className="flex items-center gap-1 rounded-full border border-[var(--color-brand-600)] bg-[var(--color-brand-50,#eff6ff)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)]">
            <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
            <button
              type="button"
              onClick={isOpen ? handleClose : handleOpen}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="focus-visible:outline-none"
            >
              {formatActiveLabel(activeFilter, today)}
            </button>
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear availability filter"
              className="ml-1 rounded-full p-0.5 hover:bg-[var(--color-brand-100,#dbeafe)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-brand-500)]"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          /* Default state: trigger button */
          <button
            type="button"
            onClick={handleOpen}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--color-fg)] transition-colors hover:border-[var(--color-brand-400)] hover:bg-[var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
          >
            <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
            Find a court
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                isOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        )}

        {/* Dismiss when panel is open and filter is active */}
        {activeFilter && isOpen && (
          <button
            type="button"
            onClick={handleClose}
            className="ml-auto text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] focus-visible:outline-none"
            aria-label="Close filter panel"
          >
            Done
          </button>
        )}
      </div>

      {/* ── Collapsible filter panel ── */}
      {isOpen && (
        <div
          id={panelId}
          role="region"
          aria-label="Availability filter"
          className="mt-3 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]"
        >
          {/* WHEN */}
          <div>
            <SectionLabel>
              <CalendarDays className="mb-px mr-1 inline size-3" aria-hidden="true" />
              When
            </SectionLabel>
            <div className="flex flex-wrap gap-2">
              {dateChips.map((chip) => (
                <ChipButton
                  key={chip.date}
                  active={selectedDate === chip.date}
                  onClick={() => setSelectedDate(chip.date)}
                >
                  <span>{chip.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1 text-[10px] font-bold",
                      selectedDate === chip.date
                        ? "bg-white/20 text-white"
                        : "bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]",
                    )}
                  >
                    {chip.sublabel}
                  </span>
                </ChipButton>
              ))}
            </div>
          </div>

          {/* WHAT TIME — dual-handle slider */}
          <div className="mt-4">
            <SectionLabel>What time</SectionLabel>
            <TimeRangeSlider
              startH={selectedStartH}
              endH={selectedEndH}
              onChangeStart={setSelectedStartH}
              onChangeEnd={setSelectedEndH}
            />
          </div>

          {/* HOW LONG */}
          <div className="mt-4">
            <SectionLabel>
              <Timer className="mb-px mr-1 inline size-3" aria-hidden="true" />
              How long
            </SectionLabel>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <ChipButton
                  key={opt.value}
                  active={selectedDuration === opt.value}
                  onClick={() => setSelectedDuration(opt.value)}
                >
                  {opt.label}
                </ChipButton>
              ))}
            </div>
          </div>

          {/* Action row */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-medium text-[var(--color-fg-muted)] underline-offset-2 hover:text-[var(--color-fg)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-1"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleFind}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-600)] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-brand-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              Find available courts
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


