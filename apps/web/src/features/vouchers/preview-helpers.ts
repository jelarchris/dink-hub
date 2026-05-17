import "server-only";
import { computeCourtFeeAcrossBands } from "@/lib/court-rate";
import { findCourtById, findCourtRateBands } from "@/features/booking/repo";
import { VoucherError } from "./errors";

/**
 * Recompute the court fee the user would be charged right now, for the
 * voucher preview UI. Mirrors the math in `features/booking/service.ts` so
 * the preview matches what the booking transaction will calculate, including
 * bookings that span multiple rate bands.
 */
export async function findCurrentBookingCourtFeeForUser(args: {
  courtId: string;
  durationMinutes: number;
  startManilaHour: number;
}): Promise<{ courtFeeCentavos: bigint; venueId: string }> {
  const [court, rateBands] = await Promise.all([
    findCourtById(args.courtId),
    findCourtRateBands(args.courtId),
  ]);
  if (!court) {
    throw new VoucherError("court_not_found", "Court not found");
  }
  const courtFeeCentavos = computeCourtFeeAcrossBands(
    rateBands.map((b) => ({
      fromHour: b.fromHour,
      toHour: b.toHour,
      rateCentavos: b.rateCentavos,
    })),
    args.startManilaHour,
    args.durationMinutes,
    court.court.hourlyRateCentavos,
  );
  return { courtFeeCentavos, venueId: court.venue.id };
}
