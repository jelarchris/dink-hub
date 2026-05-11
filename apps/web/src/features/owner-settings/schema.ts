import { z } from "zod";

export const notificationPrefsSchema = z.object({
  email_daily_digest: z.boolean(),
  email_on_payment_submitted: z.boolean(),
  email_on_booking_cancelled: z.boolean(),
});

export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
