"use client";

import { useActionState, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  previewClosureRangeAction,
  closeBookingsForRangeAction,
  type ClosurePreviewData,
  type CloseBookingsData,
} from "@/features/owner-venues/actions";
import type { ActionResult } from "@/features/auth";

interface Court {
  id: string;
  name: string;
}

interface ClosureFormProps {
  venueId: string;
  courts: Court[];
  /** Pre-select these courts. Defaults to all. */
  defaultCourtIds?: string[];
  /** When true the panel is always rendered (no inline trigger button). */
  hideTrigger?: boolean;
  /** Called after a successful commit so a parent (e.g. modal) can dismiss. */
  onCommitted?: () => void;
}

// Manila has no DST — fixed UTC+08:00.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function toManilaInputValue(d: Date): string {
  const manila = new Date(d.getTime() + MANILA_OFFSET_MS);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${manila.getUTCFullYear()}-${pad(manila.getUTCMonth() + 1)}-${pad(manila.getUTCDate())}` +
    `T${pad(manila.getUTCHours())}:${pad(manila.getUTCMinutes())}`
  );
}

function manilaInputToIso(local: string): string {
  return `${local}:00+08:00`;
}

const CATEGORY_OPTIONS = [
  { value: "weather", label: "Weather" },
  { value: "court_unavailable", label: "Court unavailable (damage / maintenance)" },
  { value: "venue_closure", label: "Venue closure (power, holiday, emergency)" },
  { value: "other", label: "Other" },
] as const;

export function ClosureForm({
  venueId,
  courts,
  defaultCourtIds,
  hideTrigger = false,
  onCommitted,
}: ClosureFormProps) {
  const [open, setOpen] = useState(hideTrigger);

  const [previewState, previewAction] = useActionState<
    ActionResult<ClosurePreviewData> | null,
    FormData
  >(previewClosureRangeAction, null);

  const [commitState, commitAction] = useActionState<
    ActionResult<CloseBookingsData> | null,
    FormData
  >(closeBookingsForRangeAction, null);

  // Wall-clock defaults: today at 08:00 → tomorrow at 22:00 (Manila).
  const now = new Date();
  const todayManila = toManilaInputValue(new Date(now.getTime()));
  const tomorrowEnd = toManilaInputValue(
    new Date(now.getTime() + 24 * 60 * 60 * 1000),
  );
  const defaultFrom = todayManila.slice(0, 11) + "08:00";
  const defaultUntil = tomorrowEnd.slice(0, 11) + "22:00";

  const [fromLocal, setFromLocal] = useState(defaultFrom);
  const [untilLocal, setUntilLocal] = useState(defaultUntil);
  const initialCourtIds =
    defaultCourtIds && defaultCourtIds.length > 0
      ? courts.filter((c) => defaultCourtIds.includes(c.id)).map((c) => c.id)
      : courts.map((c) => c.id);
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>(initialCourtIds);
  const [category, setCategory] = useState("venue_closure");
  const [reason, setReason] = useState("");

  const fromIso = manilaInputToIso(fromLocal);
  const untilIso = manilaInputToIso(untilLocal);
  const courtIdsValue = selectedCourtIds.join(",");

  // Was a successful preview loaded and not yet invalidated by form changes?
  const preview =
    previewState?.ok ? previewState.data : null;
  const totalDisplay =
    preview
      ? `₱${(Number(preview.totalCentavos) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
      : null;

  // Success state
  if (commitState?.ok) {
    const { cancelledCount, skippedCount } = commitState.data;
    return (
      <Alert variant="success" title="Venue closure recorded">
        {cancelledCount} booking{cancelledCount !== 1 ? "s" : ""} cancelled and players
        notified.
        {skippedCount > 0 && (
          <> {skippedCount} booking{skippedCount !== 1 ? "s" : ""} were modified during
          the operation and skipped — check them manually.</>
        )}
        {onCommitted && (
          <div className="mt-2">
            <button
              type="button"
              onClick={onCommitted}
              className="text-xs font-semibold text-[var(--color-fg-muted)] hover:underline"
            >
              Close
            </button>
          </div>
        )}
      </Alert>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--color-bg-subtle)] transition-colors"
      >
        <AlertTriangle className="size-3.5 text-[var(--color-warning-600)]" />
        Close venue / court…
      </button>
    );
  }

  function toggleCourt(id: string) {
    setSelectedCourtIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const hiddenFields = (
    <>
      <input type="hidden" name="venueId" value={venueId} />
      <input type="hidden" name="courtIds" value={courtIdsValue} />
      <input type="hidden" name="fromAt" value={fromIso} />
      <input type="hidden" name="untilAt" value={untilIso} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="reason" value={reason} />
    </>
  );

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-warning-300)] bg-[var(--color-warning-50)] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm text-[var(--color-warning-800)] flex items-center gap-1.5">
          <AlertTriangle className="size-4" />
          Close venue / court for a period
        </p>
        {!hideTrigger && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-[var(--color-fg-muted)] hover:underline"
          >
            Cancel
          </button>
        )}
      </div>

      {commitState && !commitState.ok && (
        <Alert variant="danger" title="Could not close venue">
          {commitState.message}
        </Alert>
      )}

      {/* ── Step 1 — Configure ─────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Court selector */}
        {courts.length > 1 && (
          <div>
            <Label className="mb-1 block">Courts to close</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedCourtIds(
                    selectedCourtIds.length === courts.length
                      ? []
                      : courts.map((c) => c.id),
                  )
                }
                className="rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors"
                style={
                  selectedCourtIds.length === courts.length
                    ? { background: "var(--color-brand-600)", color: "#fff", borderColor: "var(--color-brand-600)" }
                    : { background: "transparent", borderColor: "var(--color-border-strong)" }
                }
              >
                All courts
              </button>
              {courts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCourt(c.id)}
                  className="rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors"
                  style={
                    selectedCourtIds.includes(c.id)
                      ? { background: "var(--color-brand-600)", color: "#fff", borderColor: "var(--color-brand-600)" }
                      : { background: "transparent", borderColor: "var(--color-border-strong)" }
                  }
                >
                  {c.name}
                </button>
              ))}
            </div>
            {selectedCourtIds.length === 0 && (
              <p className="mt-1 text-xs text-[var(--color-danger-600)]">Select at least one court.</p>
            )}
          </div>
        )}

        {/* Date range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="closure-from">From (Manila)</Label>
            <input
              id="closure-from"
              type="datetime-local"
              step={1800}
              required
              value={fromLocal}
              onChange={(e) => setFromLocal(e.target.value)}
              className="mt-1 flex h-11 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
            />
          </div>
          <div>
            <Label htmlFor="closure-until">Until (Manila)</Label>
            <input
              id="closure-until"
              type="datetime-local"
              step={1800}
              required
              value={untilLocal}
              onChange={(e) => setUntilLocal(e.target.value)}
              className="mt-1 flex h-11 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
            />
          </div>
        </div>
      </div>

      {/* ── Step 2 — Preview ───────────────────────────────────────── */}
      <form action={previewAction}>
        {hiddenFields}
        {/* Category + reason are in the preview form so validation runs before commit. */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="closure-category">Reason category</Label>
            <Select
              id="closure-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              className="mt-1"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="closure-reason">Reason (sent to players)</Label>
            <Textarea
              id="closure-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={500}
              rows={2}
              placeholder="e.g. All courts closed for flood cleanup — reopening Monday 18 May."
              className="mt-1"
            />
          </div>

          {previewState && !previewState.ok && (
            <Alert variant="danger" title="Preview failed">
              {previewState.message}
            </Alert>
          )}

          {preview && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-warning-300)] bg-white px-4 py-3 text-sm">
              <span className="font-semibold">
                {preview.bookingCount === 0
                  ? "No active bookings in this window."
                  : `${preview.bookingCount} booking${preview.bookingCount !== 1 ? "s" : ""} will be cancelled`}
              </span>
              {preview.bookingCount > 0 && totalDisplay && (
                <span className="ml-1 text-[var(--color-fg-muted)]">
                  · {totalDisplay} total paid will need refunding
                </span>
              )}
            </div>
          )}

          <SubmitButton
            variant="outline"
            size="sm"
            pendingLabel="Checking…"
            disabled={selectedCourtIds.length === 0}
          >
            Preview affected bookings
          </SubmitButton>
        </div>
      </form>

      {/* ── Step 3 — Commit (only shown after a successful preview) ── */}
      {preview && preview.bookingCount > 0 && (
        <form action={commitAction} className="border-t border-[var(--color-warning-200)] pt-3">
          {hiddenFields}

          <p className="mb-2 text-xs text-[var(--color-warning-700)]">
            This will permanently cancel {preview.bookingCount} booking
            {preview.bookingCount !== 1 ? "s" : ""}. Players will be emailed.
            Paid bookings will need a manual GCash refund.
          </p>
          <SubmitButton variant="destructive" size="sm" pendingLabel="Closing…">
            Confirm closure — cancel {preview.bookingCount} booking
            {preview.bookingCount !== 1 ? "s" : ""}
          </SubmitButton>
        </form>
      )}
      {preview && preview.bookingCount === 0 && (
        <p className="text-xs text-[var(--color-fg-muted)]">
          No bookings to cancel in this window. You can close the form.
        </p>
      )}
    </div>
  );
}
