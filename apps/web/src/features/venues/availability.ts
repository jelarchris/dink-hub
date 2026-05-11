/**
 * Shared constants and types for the /venues availability filter.
 *
 * This file has NO server-only imports so it is safe to import from both
 * server modules (repo.ts) and client components (availability-filter.tsx).
 *
 * Do NOT import from `@/features/venues` (the barrel) in client components —
 * the barrel re-exports from repo.ts which is "server-only".
 * Import from `@/features/venues/availability` directly instead.
 */

export type TimeOfDay = "morning" | "afternoon" | "evening" | "late_night";

export interface AvailabilityFilter {
  /** YYYY-MM-DD in Asia/Manila timezone. */
  date: string;
  tod: TimeOfDay;
  /** Duration in minutes the player wants to play. One of 30|60|90|120. */
  durationMin: 30 | 60 | 90 | 120;
}

/** Manila local-time hour ranges [startH, endH) for each time-of-day preset.
 *  Values > 23 overflow into the next calendar day (25 = 01:00 next day). */
export const TOD_OPTIONS = [
  {
    value: "morning" as const,
    label: "Morning",
    timeLabel: "6am – 12pm",
    startH: 6,
    endH: 12,
  },
  {
    value: "afternoon" as const,
    label: "Afternoon",
    timeLabel: "12pm – 5pm",
    startH: 12,
    endH: 17,
  },
  {
    value: "evening" as const,
    label: "Evening",
    timeLabel: "5pm – 10pm",
    startH: 17,
    endH: 22,
  },
  {
    value: "late_night" as const,
    label: "Late night",
    timeLabel: "10pm – 1am",
    startH: 22,
    endH: 25, // 25 h = 01:00 the following calendar day
  },
] as const satisfies ReadonlyArray<{
  value: TimeOfDay;
  label: string;
  timeLabel: string;
  startH: number;
  endH: number;
}>;

export const DURATION_OPTIONS = [
  { value: 30 as const, label: "30 min" },
  { value: 60 as const, label: "1 hr" },
  { value: 90 as const, label: "1.5 hr" },
  { value: 120 as const, label: "2 hr" },
] as const;

export const DEFAULT_TOD: TimeOfDay = "evening";
export const DEFAULT_DURATION = 60 as const;

// ---------------------------------------------------------------------------
// Date helpers (pure, no server dependencies)
// ---------------------------------------------------------------------------
const MANILA_TZ = "Asia/Manila";

/** Format a Date as "YYYY-MM-DD" in Asia/Manila timezone. */
export function formatManilaDate(date: Date): string {
  // en-CA locale formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TZ }).format(date);
}

/** Add N calendar days to a YYYY-MM-DD date string (Manila-aware). */
export function addManilaDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Use noon UTC to avoid any DST-adjacent edge cases (Manila has no DST, but
  // the UTC representation of a Manila midnight can land on the previous UTC day).
  return formatManilaDate(new Date(Date.UTC(y!, m! - 1, d! + days, 4, 0, 0)));
}

/** Return the 0-based day-of-week (0=Sun) for a YYYY-MM-DD in Manila time. */
export function getManilaDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 4, 0, 0));
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TZ,
    weekday: "short",
  }).format(dt);
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  return DAYS.indexOf(wd as (typeof DAYS)[number]);
}

export interface DateChip {
  label: string; // "Today" | "Tomorrow" | "Sat" | "Sun"
  sublabel: string; // "12" (day-of-month)
  date: string; // YYYY-MM-DD
}

/**
 * Build the 4-chip date row shown in the filter panel.
 * Always: Today + Tomorrow + next Saturday + next Sunday
 * (collapsed if they coincide with Today/Tomorrow).
 */
export function buildDateChips(today: string): DateChip[] {
  const tomorrow = addManilaDays(today, 1);
  const dow = getManilaDayOfWeek(today);

  // Days until next Saturday/Sunday (never 0 — push to next week if already that day)
  const daysToSat = ((6 - dow + 7) % 7) || 7;
  const daysToSun = ((0 - dow + 7) % 7) || 7;

  const thisSat = addManilaDays(today, daysToSat);
  const thisSun = addManilaDays(today, daysToSun);

  const chips: DateChip[] = [
    { label: "Today", sublabel: today.slice(8), date: today },
    { label: "Tomorrow", sublabel: tomorrow.slice(8), date: tomorrow },
  ];

  if (thisSat !== today && thisSat !== tomorrow) {
    chips.push({ label: "Sat", sublabel: thisSat.slice(8), date: thisSat });
  }
  if (thisSun !== today && thisSun !== tomorrow && thisSun !== thisSat) {
    chips.push({ label: "Sun", sublabel: thisSun.slice(8), date: thisSun });
  }

  return chips;
}
