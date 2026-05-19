import "server-only";
import { cache } from "react";
import {
  findActiveVenueBySlug,
  getCourtsOccupancy,
} from "@/features/venues";
import { findCourtRateBands } from "@/features/booking/repo";
import { fromManilaWallClock } from "@/lib/date";
import { getRateForHour, type RateBand } from "@/lib/court-rate";

/**
 * Share-card data: everything an OG image needs to render a single
 * (venue, court, date) availability poster. Pure read; no auth.
 *
 * Returned ranges are merged consecutive Manila wall-clock hours that are
 * unoccupied AND not in the past. Pricing is per-hour and tagged with the
 * hour range each price applies to so the image can show "₱150 day / ₱200 night"
 * when bands cross.
 */

export interface ShareSlotRange {
  /** Manila wall-clock hour, 0-23 (inclusive start). */
  startHour: number;
  /** Manila wall-clock hour, 1-24 (exclusive end). */
  endHour: number;
  /** All distinct hourly rates that apply within this range. */
  rates: bigint[];
}

export interface ShareCardData {
  venue: {
    name: string;
    slug: string;
    city: string;
    province: string;
    coverImageUrl: string | null;
  };
  court: {
    id: string;
    name: string;
    openHour: number;
    closeHour: number;
    baseHourlyRateCentavos: bigint;
  };
  /** ISO YYYY-MM-DD in Manila. */
  dateIso: string;
  /** Human-readable Manila date, e.g. "Wed, May 21". */
  dateLabel: string;
  /** Long Manila date, e.g. "Wednesday, May 21, 2026". */
  dateLongLabel: string;
  /** Merged available ranges, sorted ascending. Empty when nothing is open. */
  available: ShareSlotRange[];
  /** Total number of open hours across all ranges. */
  totalOpenHours: number;
  /** Whether the entire day is fully booked / closed / past. */
  fullyUnavailable: boolean;
}

const MANILA_DATE_LABEL = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  month: "short",
  day: "numeric",
});

const MANILA_DATE_LONG = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const loadVenueCached = cache(async (slug: string) => findActiveVenueBySlug(slug));

export async function getShareCardData(args: {
  venueSlug: string;
  dateIso: string;
  courtId?: string;
}): Promise<ShareCardData | null> {
  const found = await loadVenueCached(args.venueSlug);
  if (!found) return null;
  const { venue, courts } = found;
  if (courts.length === 0) return null;

  const court =
    (args.courtId && courts.find((c) => c.id === args.courtId)) || courts[0]!;

  const [y, m, d] = args.dateIso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dayStartUtc = fromManilaWallClock(y, m, d, 0, 0);
  const dayEndUtc = fromManilaWallClock(y, m, d, 24, 0);

  const [occupancy, bandsRaw] = await Promise.all([
    getCourtsOccupancy({
      courtIds: [court.id],
      fromUtc: dayStartUtc,
      toUtc: dayEndUtc,
    }),
    findCourtRateBands(court.id),
  ]);

  const bands: RateBand[] = bandsRaw.map((b) => ({
    fromHour: b.fromHour,
    toHour: b.toHour,
    rateCentavos: b.rateCentavos,
  }));

  // Build hour-by-hour availability map (24 entries, true = open).
  const nowMs = Date.now();
  const open: boolean[] = new Array(24).fill(false);
  for (let h = 0; h < 24; h++) {
    if (h < court.openHour || h >= court.closeHour) continue;
    const slotStart = fromManilaWallClock(y, m, d, h, 0).getTime();
    const slotEnd = fromManilaWallClock(y, m, d, h + 1, 0).getTime();
    if (slotStart <= nowMs) continue; // past
    const overlaps = occupancy.some(
      (r) => r.startAt.getTime() < slotEnd && r.endAt.getTime() > slotStart,
    );
    if (!overlaps) open[h] = true;
  }

  // Merge consecutive open hours into ranges and collect distinct rates per range.
  const available: ShareSlotRange[] = [];
  let i = 0;
  while (i < 24) {
    if (!open[i]) {
      i++;
      continue;
    }
    const startHour = i;
    const rates: bigint[] = [];
    while (i < 24 && open[i]) {
      const rate = getRateForHour(bands, i, court.hourlyRateCentavos);
      if (!rates.some((r) => r === rate)) rates.push(rate);
      i++;
    }
    available.push({ startHour, endHour: i, rates });
  }

  const totalOpenHours = available.reduce((sum, r) => sum + (r.endHour - r.startHour), 0);

  const dateObj = fromManilaWallClock(y, m, d, 12, 0); // noon to avoid TZ edge
  return {
    venue: {
      name: venue.name,
      slug: venue.slug,
      city: venue.city,
      province: venue.province,
      coverImageUrl: venue.coverImageUrl,
    },
    court: {
      id: court.id,
      name: court.name,
      openHour: court.openHour,
      closeHour: court.closeHour,
      baseHourlyRateCentavos: court.hourlyRateCentavos,
    },
    dateIso: args.dateIso,
    dateLabel: MANILA_DATE_LABEL.format(dateObj),
    dateLongLabel: MANILA_DATE_LONG.format(dateObj),
    available,
    totalOpenHours,
    fullyUnavailable: available.length === 0,
  };
}

/** Format an hour (0-24) as a Manila wall-clock label, e.g. 9 -> "9 AM", 13 -> "1 PM", 24 -> "12 AM". */
export function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

/** Format a range as "9 AM – 12 PM". Hyphen is U+2013. */
export function formatRangeLabel(r: ShareSlotRange): string {
  return `${formatHourLabel(r.startHour)}\u2009\u2013\u2009${formatHourLabel(r.endHour)}`;
}
