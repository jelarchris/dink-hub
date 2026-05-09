/**
 * Date utilities for the booking flow.
 * The Philippines uses Asia/Manila (UTC+8, no DST). All slots are 30-min aligned
 * in *Manila wall-clock time*. We construct UTC Date objects from Manila wall-clock
 * inputs by leveraging the fixed offset.
 *
 * NOTE: never use `Date.now()` for slot math — fetch `now` from the DB inside
 * service operations. This module is for pure UI / formatting helpers.
 */

const MANILA_OFFSET_MIN = 8 * 60; // UTC+8

const TIME_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  month: "short",
  day: "numeric",
});

const DATE_LONG_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatTimeManila(d: Date): string {
  return TIME_FORMATTER.format(d);
}

export function formatDateManila(d: Date): string {
  return DATE_FORMATTER.format(d);
}

export function formatDateLongManila(d: Date): string {
  return DATE_LONG_FORMATTER.format(d);
}

export function formatDateTimeManila(d: Date): string {
  return DATETIME_FORMATTER.format(d);
}

/**
 * Construct a UTC Date that represents the given Manila wall-clock time.
 * `manilaY/M/D/h/m` are the values you'd see on a Manila clock.
 */
export function fromManilaWallClock(
  y: number,
  m: number, // 1-12
  d: number, // 1-31
  h: number,
  min: number,
): Date {
  // Date.UTC interprets the args as UTC. Subtract the Manila offset to convert.
  return new Date(Date.UTC(y, m - 1, d, h, min) - MANILA_OFFSET_MIN * 60_000);
}

/**
 * Return the {y, m, d} of the Manila day that contains the given UTC instant.
 */
export function manilaCalendarParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Builds the inclusive list of N upcoming Manila days starting from today.
 * Returns ISO date strings (YYYY-MM-DD) and Date objects pointing at Manila 00:00 of that day.
 */
export function manilaUpcomingDays(
  count: number,
): Array<{ isoDate: string; manilaMidnightUtc: Date; label: string; isToday: boolean }> {
  const now = new Date();
  const today = manilaCalendarParts(now);
  const out: ReturnType<typeof manilaUpcomingDays> = [];
  for (let i = 0; i < count; i++) {
    const start = fromManilaWallClock(today.year, today.month, today.day + i, 0, 0);
    const parts = manilaCalendarParts(start);
    const iso = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    out.push({
      isoDate: iso,
      manilaMidnightUtc: start,
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatDateManila(start),
      isToday: i === 0,
    });
  }
  return out;
}

/**
 * Generate 30-minute Manila slot start times between [startHour, endHour) for a day.
 * Returns UTC Date objects.
 */
export function generateDaySlotsManila(args: {
  isoDate: string; // YYYY-MM-DD in Manila
  startHour: number; // inclusive (0-23)
  endHour: number; // exclusive (1-24)
}): Date[] {
  const [y, m, d] = args.isoDate.split("-").map(Number);
  if (!y || !m || !d) return [];
  const out: Date[] = [];
  for (let h = args.startHour; h < args.endHour; h++) {
    out.push(fromManilaWallClock(y, m, d, h, 0));
    out.push(fromManilaWallClock(y, m, d, h, 30));
  }
  return out;
}

export function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}
