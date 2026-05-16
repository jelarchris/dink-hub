"use client";

import { CalendarPlus, MapPin, Phone, Receipt } from "lucide-react";
import { cn } from "@/lib/cn";

interface BookingActionButtonsProps {
  bookingTitle: string;
  bookingDescription: string;
  bookingLocation: string;
  /** ISO string — converted to UTC ics format on click. */
  startAtIso: string;
  endAtIso: string;
  /** Direct https Google Maps URL (pre-built server-side). */
  directionsUrl: string | null;
  /** E.164 phone, or null when venue has no contact set up. */
  contactPhone: string | null;
  /** Signed receipt URL (expires after a few minutes). */
  receiptUrl: string | null;
}

/**
 * 2x2 grid of quick actions for the booking detail page.
 * - Calendar: builds an .ics blob client-side and triggers a download (no server round-trip)
 * - Directions / Contact / Receipt are simple external links
 *
 * Each disabled state still renders the button so the layout stays balanced
 * (e.g. "No phone" instead of a missing tile).
 */
export function BookingActionButtons({
  bookingTitle,
  bookingDescription,
  bookingLocation,
  startAtIso,
  endAtIso,
  directionsUrl,
  contactPhone,
  receiptUrl,
}: BookingActionButtonsProps) {
  function handleAddToCalendar() {
    const ics = buildIcs({
      title: bookingTitle,
      description: bookingDescription,
      location: bookingLocation,
      startAt: new Date(startAtIso),
      endAt: new Date(endAtIso),
    });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dinkhub-booking.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <ActionTile
        icon={<CalendarPlus className="size-5" aria-hidden />}
        label="Add to Calendar"
        onClick={handleAddToCalendar}
      />
      <ActionTile
        icon={<MapPin className="size-5" aria-hidden />}
        label="Get Directions"
        href={directionsUrl ?? undefined}
        external
        disabled={!directionsUrl}
      />
      <ActionTile
        icon={<Phone className="size-5" aria-hidden />}
        label={contactPhone ? "Contact Venue" : "No phone listed"}
        href={contactPhone ? `tel:${contactPhone}` : undefined}
        disabled={!contactPhone}
      />
      <ActionTile
        icon={<Receipt className="size-5" aria-hidden />}
        label="View Receipt"
        href={receiptUrl ?? undefined}
        external
        disabled={!receiptUrl}
      />
    </div>
  );
}

function ActionTile({
  icon,
  label,
  href,
  external,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string | undefined;
  external?: boolean | undefined;
  onClick?: (() => void) | undefined;
  disabled?: boolean | undefined;
}) {
  const base = cn(
    "flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-3 text-center text-xs font-semibold transition-colors",
    disabled
      ? "cursor-not-allowed border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] text-[var(--color-fg-subtle)]"
      : "border-[var(--color-border-default)] bg-[var(--color-bg)] text-[var(--color-fg)] hover:border-[var(--color-brand-500)] hover:bg-[var(--color-brand-50)] active:scale-[0.98]",
  );

  if (href && !disabled) {
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={base}
      >
        {icon}
        <span>{label}</span>
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={base}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ICS builder (RFC 5545, minimal viable)
// ---------------------------------------------------------------------------

function buildIcs(args: {
  title: string;
  description: string;
  location: string;
  startAt: Date;
  endAt: Date;
}): string {
  const toIcsDate = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@dinkhub.ph`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DinkHub//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(args.startAt)}`,
    `DTEND:${toIcsDate(args.endAt)}`,
    `SUMMARY:${escape(args.title)}`,
    `DESCRIPTION:${escape(args.description)}`,
    `LOCATION:${escape(args.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
