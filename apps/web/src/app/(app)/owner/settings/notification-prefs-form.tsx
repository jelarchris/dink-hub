"use client";

import { useActionState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { updateNotificationPrefsAction } from "@/features/owner-settings/actions";
import type { NotificationPrefs } from "@/features/owner-settings/types";

interface Props {
  prefs: NotificationPrefs;
}

const INITIAL = null;

export function NotificationPrefsForm({ prefs }: Props) {
  const [state, formAction, isPending] = useActionState(updateNotificationPrefsAction, INITIAL);

  return (
    <form action={formAction} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-700">Email notifications</legend>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 cursor-pointer hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            name="email_on_payment_submitted"
            defaultChecked={prefs.email_on_payment_submitted}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-700"
          />
          <div>
            <div className="text-sm font-medium text-slate-900">New payment receipt</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Get an email when a player uploads a GCash receipt for review.
            </div>
          </div>
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 cursor-pointer hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            name="email_on_booking_cancelled"
            defaultChecked={prefs.email_on_booking_cancelled}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-700"
          />
          <div>
            <div className="text-sm font-medium text-slate-900">Booking cancelled by player</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Get an email when a player cancels their own booking.
            </div>
          </div>
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 cursor-pointer hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            name="email_daily_digest"
            defaultChecked={prefs.email_daily_digest}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-700"
          />
          <div>
            <div className="text-sm font-medium text-slate-900">Daily activity digest</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Receive a daily summary of new bookings and pending receipts (sent at 8:00 AM Manila
              time). Only sent on days with activity.
            </div>
          </div>
        </label>
      </fieldset>

      {state && !state.ok && (
        <Alert variant="warning" title="Could not save">
          {state.message}
        </Alert>
      )}
      {state?.ok && (
        <Alert variant="success" title="Preferences saved">
          Your notification settings have been updated.
        </Alert>
      )}

      <Button type="submit" disabled={isPending} className="gap-2">
        <Bell className="h-4 w-4" />
        {isPending ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}
