"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, SlidersHorizontal, Timer, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  buildDateChips,
  DEFAULT_DURATION,
  DEFAULT_TOD,
  DURATION_OPTIONS,
  TOD_OPTIONS,
  type AvailabilityFilter,
  type TimeOfDay,
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
  tod?: string;
  dur?: string;
}): string {
  const p = new URLSearchParams();
  if (params.q) p.set("q", params.q);
  if (params.city) p.set("city", params.city);
  if (params.sort && params.sort !== "name") p.set("sort", params.sort);
  if (params.date) p.set("date", params.date);
  if (params.tod) p.set("tod", params.tod);
  if (params.dur) p.set("dur", params.dur);
  const qs = p.toString();
  return qs ? `/venues?${qs}` : "/venues";
}

function formatActiveLabel(filter: AvailabilityFilter, today: string): string {
  const todLabel = TOD_OPTIONS.find((o) => o.value === filter.tod)?.label ?? filter.tod;
  const durLabel =
    DURATION_OPTIONS.find((o) => o.value === filter.durationMin)?.label ??
    `${filter.durationMin} min`;

  let dateLabel: string;
  const [, , dayStr] = filter.date.split("-");
  const day = Number(dayStr);
  if (filter.date === today) {
    dateLabel = "Today";
  } else {
    // e.g. "Sat 17"
    const [y, m, d] = filter.date.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!, 4));
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      weekday: "short",
    }).format(dt);
    dateLabel = `${wd} ${day}`;
  }

  return `${todLabel} · ${dateLabel} · ${durLabel}`;
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
  const [selectedTod, setSelectedTod] = useState<TimeOfDay>(
    activeFilter?.tod ?? DEFAULT_TOD,
  );
  const [selectedDuration, setSelectedDuration] = useState<30 | 60 | 90 | 120>(
    activeFilter?.durationMin ?? DEFAULT_DURATION,
  );

  const dateChips = useMemo(() => buildDateChips(today), [today]);

  const handleOpen = useCallback(() => {
    // Re-sync selections to active filter (or defaults) each time panel opens.
    setSelectedDate(activeFilter?.date ?? today);
    setSelectedTod(activeFilter?.tod ?? DEFAULT_TOD);
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
        tod: selectedTod,
        dur: String(selectedDuration),
      }),
    );
    setIsOpen(false);
  }, [currentQ, currentCity, currentSort, selectedDate, selectedTod, selectedDuration, router]);

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

          {/* WHAT TIME */}
          <div className="mt-4">
            <SectionLabel>What time</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {TOD_OPTIONS.map((opt) => (
                <ChipButton
                  key={opt.value}
                  active={selectedTod === opt.value}
                  onClick={() => setSelectedTod(opt.value)}
                >
                  {opt.label}
                  <span
                    className={cn(
                      "text-[10px]",
                      selectedTod === opt.value
                        ? "text-white/75"
                        : "text-[var(--color-fg-muted)]",
                    )}
                  >
                    {opt.timeLabel}
                  </span>
                </ChipButton>
              ))}
            </div>
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
