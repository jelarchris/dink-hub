"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { startBookingFormAction } from "@/features/booking/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  addMinutes,
  formatTimeManila,
  generateDaySlotsManila,
} from "@/lib/date";
import { formatPHP } from "@/lib/money";

const DURATIONS = [30, 60, 90, 120, 180, 240] as const;
type Duration = (typeof DURATIONS)[number];
const OPEN_HOUR = 6;
const CLOSE_HOUR = 22;

export interface SlotPickerProps {
  venueSlug: string;
  days: ReadonlyArray<{ isoDate: string; label: string; isToday: boolean }>;
  selectedDateIso: string;
  courts: ReadonlyArray<{
    id: string;
    name: string;
    surface: string;
    isIndoor: boolean;
    hourlyRateCentavos: string; // bigint serialised
  }>;
  selectedCourtId: string;
  durationMin: Duration;
  occupancy: ReadonlyArray<{ startAtIso: string; endAtIso: string }>;
}

export function SlotPicker({
  venueSlug,
  days,
  selectedDateIso,
  courts,
  selectedCourtId,
  durationMin,
  occupancy,
}: SlotPickerProps) {
  const selectedCourt = courts.find((c) => c.id === selectedCourtId)!;
  const hourlyRate = BigInt(selectedCourt.hourlyRateCentavos);
  const slotPriceCentavos = (BigInt(durationMin) * hourlyRate) / 60n;

  const slots = useMemo(
    () =>
      generateDaySlotsManila({
        isoDate: selectedDateIso,
        startHour: OPEN_HOUR,
        endHour: CLOSE_HOUR,
      }),
    [selectedDateIso],
  );

  const occupiedRanges = useMemo(
    () =>
      occupancy.map((o) => ({
        start: new Date(o.startAtIso).getTime(),
        end: new Date(o.endAtIso).getTime(),
      })),
    [occupancy],
  );
  // Frozen at mount: filter past slots without a live ticker. Page is meant
  // to be navigated (which re-mounts via routing), not idled on for hours.
  const [now] = useState(() => Date.now());

  function buildHref(patch: Partial<{ date: string; courtId: string; duration: number }>) {
    const params = new URLSearchParams({
      date: patch.date ?? selectedDateIso,
      courtId: patch.courtId ?? selectedCourtId,
      duration: String(patch.duration ?? durationMin),
    });
    return `/venues/${venueSlug}?${params.toString()}`;
  }

  function isAvailable(slotStart: Date): boolean {
    const start = slotStart.getTime();
    const end = start + durationMin * 60_000;
    if (start <= now) return false;
    if (end > new Date(`${selectedDateIso}T23:59:59+08:00`).getTime() + 60_000) return false;
    for (const r of occupiedRanges) {
      if (r.start < end && r.end > start) return false;
    }
    return true;
  }

  // Server action returns ActionResult; <form action> expects void/Promise<void>.
  // We use the void-returning twin from the booking feature.

  return (
    <div className="space-y-5">
      {/* Day tabs */}
      <Tabs label="Date">
        <div className="flex flex-wrap gap-2">
          {days.map((d) => (
            <Link
              key={d.isoDate}
              href={buildHref({ date: d.isoDate })}
              prefetch={false}
              className={pillClass(d.isoDate === selectedDateIso)}
              aria-current={d.isoDate === selectedDateIso ? "true" : undefined}
            >
              {d.label}
            </Link>
          ))}
        </div>
      </Tabs>

      {/* Court selector — only when >1 court */}
      {courts.length > 1 && (
        <Tabs label="Court">
          <div className="flex flex-wrap gap-2">
            {courts.map((c) => (
              <Link
                key={c.id}
                href={buildHref({ courtId: c.id })}
                prefetch={false}
                className={pillClass(c.id === selectedCourtId)}
              >
                {c.name}
              </Link>
            ))}
          </div>
        </Tabs>
      )}

      {/* Duration selector */}
      <Tabs label="Duration">
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <Link
              key={d}
              href={buildHref({ duration: d })}
              prefetch={false}
              className={pillClass(d === durationMin)}
            >
              {d < 60 ? `${d} min` : `${d / 60} h${d > 60 ? "rs" : ""}`}
            </Link>
          ))}
        </div>
      </Tabs>

      <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] px-4 py-2.5 text-sm">
        <span className="text-[var(--color-fg-muted)]">Selected: </span>
        <span className="font-medium">
          {durationMin < 60 ? `${durationMin} min` : `${durationMin / 60} h`} on{" "}
          {selectedCourt.name}
        </span>
        <span className="ml-2 font-semibold text-[var(--color-brand-700)]">
          {formatPHP(slotPriceCentavos)}
        </span>
        <span className="text-[var(--color-fg-muted)]"> + system fee</span>
      </div>

      {/* Slot grid */}
      <div>
        <div className="mb-2 text-sm font-medium">Available start times</div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5">
          {slots.map((s) => {
            const available = isAvailable(s);
            const endAt = addMinutes(s, durationMin);
            return (
              <form action={startBookingFormAction} key={s.toISOString()}>
                <input type="hidden" name="venueSlug" value={venueSlug} />
                <input type="hidden" name="courtId" value={selectedCourtId} />
                <input type="hidden" name="startAt" value={s.toISOString()} />
                <input type="hidden" name="endAt" value={endAt.toISOString()} />
                <Button
                  type="submit"
                  variant={available ? "outline" : "secondary"}
                  size="md"
                  disabled={!available}
                  className={cn(
                    "w-full justify-center",
                    available &&
                      "hover:border-[var(--color-brand-500)] hover:bg-[var(--color-brand-50)] hover:text-[var(--color-brand-800)]",
                  )}
                >
                  {formatTimeManila(s)}
                </Button>
              </form>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tabs({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function pillClass(active: boolean): string {
  return cn(
    "inline-flex h-9 items-center rounded-full border px-3.5 text-sm transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]",
    active
      ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)] text-white"
      : "border-[var(--color-border-strong)] bg-[var(--color-bg)] text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]",
  );
}
