import type { Booking, Payment, SlotHold } from "@/db/schema";

/** Public, app-facing types re-exported from DB inferred types. */
export type { Booking, Payment, SlotHold };

/** Result of a successful booking creation: booking row + total to pay. */
export type CreatedBooking = {
  booking: Booking;
  /** Convenience: total_centavos as bigint, matches generated DB column. */
  totalCentavos: bigint;
};

/** Result of submitting a payment receipt. */
export type SubmittedPayment = {
  payment: Payment;
  booking: Booking;
};
