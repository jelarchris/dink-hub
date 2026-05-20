"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { ClosureForm } from "../venues/[id]/closure-form";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";

interface VenueWithCourts {
  venue: { id: string; name: string };
  courts: { id: string; name: string }[];
}

interface CloseVenueLauncherProps {
  venues: VenueWithCourts[];
  defaultVenueId?: string;
  /** Pre-select a single court (used by per-court "Close this court" affordance). */
  defaultCourtId?: string;
  /** Override the trigger button label. */
  triggerLabel?: string;
  /** Compact pill style for placement inside grid headers. */
  variant?: "header" | "compact";
}

/**
 * Single entry point for "Close venue / court for a period".
 * Renders a trigger button + portal-less modal that wraps the existing
 * <ClosureForm> with optional venue picker.
 */
export function CloseVenueLauncher({
  venues,
  defaultVenueId,
  defaultCourtId,
  triggerLabel = "Close venue / court…",
  variant = "header",
}: CloseVenueLauncherProps) {
  const [open, setOpen] = useState(false);

  const defaultSelectedVenue = useMemo(() => {
    if (defaultVenueId && venues.some((v) => v.venue.id === defaultVenueId)) {
      return defaultVenueId;
    }
    return venues[0]?.venue.id ?? "";
  }, [defaultVenueId, venues]);

  const [selectedVenueId, setSelectedVenueId] = useState(defaultSelectedVenue);

  const close = useCallback(() => setOpen(false), []);

  // Body scroll lock + Esc to dismiss.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (venues.length === 0) return null;

  const activeVenue = venues.find((v) => v.venue.id === selectedVenueId) ?? venues[0]!;

  const triggerClass =
    variant === "header"
      ? "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-warning-300)] bg-[var(--color-warning-50)] px-3 py-1.5 text-xs font-bold text-[var(--color-warning-800)] hover:bg-[var(--color-warning-100)] transition-colors"
      : "inline-flex items-center gap-1 rounded-full border border-[var(--color-warning-300)] bg-[var(--color-warning-50)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-warning-800)] hover:bg-[var(--color-warning-100)] transition-colors";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClass}>
        <AlertTriangle className={cn(variant === "header" ? "size-3.5" : "size-3")} />
        {triggerLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Close venue or court"
          onClick={close}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-[var(--color-border-default)] bg-[var(--color-bg)] shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-4 py-3">
              <h2 className="text-base font-bold text-[var(--color-fg)] flex items-center gap-2">
                <AlertTriangle className="size-4 text-[var(--color-warning-600)]" />
                Close venue / court
              </h2>
              <button
                type="button"
                onClick={close}
                className="rounded-full p-1.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)]"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto p-4 space-y-3">
              {venues.length > 1 && (
                <div>
                  <Label htmlFor="closure-venue">Venue</Label>
                  <Select
                    id="closure-venue"
                    value={selectedVenueId}
                    onChange={(e) => setSelectedVenueId(e.target.value)}
                    className="mt-1"
                  >
                    {venues.map((v) => (
                      <option key={v.venue.id} value={v.venue.id}>
                        {v.venue.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Remount the form when venue changes so its internal state resets. */}
              <ClosureForm
                key={activeVenue.venue.id}
                venueId={activeVenue.venue.id}
                courts={activeVenue.courts}
                hideTrigger
                {...(defaultCourtId && activeVenue.courts.some((c) => c.id === defaultCourtId)
                  ? { defaultCourtIds: [defaultCourtId] }
                  : {})}
                onCommitted={close}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
