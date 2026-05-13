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
