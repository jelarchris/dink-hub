/** Notification preference keys must match the DB CHECK constraint in 0012_owner_notification_prefs.sql. */
export interface NotificationPrefs {
  email_daily_digest: boolean;
  email_on_payment_submitted: boolean;
  email_on_booking_cancelled: boolean;
}
