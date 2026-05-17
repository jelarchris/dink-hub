/**
 * Rate-band lookup for per-hour court pricing.
 *
 * A court can have multiple non-overlapping time bands (e.g. day ₱150, night ₱200).
 * When no band covers `startHour`, we fall back to the court's base hourly rate.
 *
 * `startHour` is the Manila wall-clock hour (0–23) of the booking's start time.
 */
export interface RateBand {
  fromHour: number;
  toHour: number;
  rateCentavos: bigint;
}

/**
 * Find the applicable rate for a booking that starts at `startHour`.
 * A band matches when `fromHour <= startHour < toHour`.
 */
export function getRateForHour(
  bands: RateBand[],
  startHour: number,
  fallbackCentavos: bigint,
): bigint {
  const match = bands.find((b) => startHour >= b.fromHour && startHour < b.toHour);
  return match?.rateCentavos ?? fallbackCentavos;
}

/**
 * Compute the court fee for a booking that may span multiple rate bands.
 *
 * Bookings use 60-minute slot granularity, and rate bands are hour-aligned,
 * so we sum the price of each 1-hour slot using the band that covers that
 * slot's Manila wall-clock hour. This is the only way to price correctly
 * when a booking crosses a band boundary (e.g. 3pm-6pm with a day/night
 * switch at 5pm → 150+150+200 = 500).
 *
 * `startManilaHour` is the Manila wall-clock hour (0–23) of the booking's
 * start. Slots that roll past midnight wrap via mod 24 — bands are
 * day-of-week-agnostic in the current model.
 */
export function computeCourtFeeAcrossBands(
  bands: RateBand[],
  startManilaHour: number,
  durationMinutes: number,
  fallbackCentavos: bigint,
): bigint {
  const SLOT_MIN = 60;
  let total = 0n;
  for (let offset = 0; offset < durationMinutes; offset += SLOT_MIN) {
    const slotHour = Math.floor((startManilaHour * 60 + offset) / 60) % 24;
    const hourly = getRateForHour(bands, slotHour, fallbackCentavos);
    total += (BigInt(SLOT_MIN) * hourly) / 60n;
  }
  return total;
}

/**
 * Serialisation helper: bands returned from DB have bigint rateCentavos.
 * Client components can't receive bigint via props — convert to string first.
 */
export interface RateBandSerialized {
  fromHour: number;
  toHour: number;
  rateCentavos: string;
}

export function serializeBands(bands: RateBand[]): RateBandSerialized[] {
  return bands.map((b) => ({ ...b, rateCentavos: b.rateCentavos.toString() }));
}

export function deserializeBands(bands: RateBandSerialized[]): RateBand[] {
  return bands.map((b) => ({ ...b, rateCentavos: BigInt(b.rateCentavos) }));
}
