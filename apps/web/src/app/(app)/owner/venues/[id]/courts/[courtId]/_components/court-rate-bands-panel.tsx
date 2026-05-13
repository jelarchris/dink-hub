"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
// Direct import — never import from the feature barrel in a client component.
import { saveCourtRateBandsAction } from "@/features/owner-venues/actions";

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => i); // 0–24

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  if (h === 24) return "12:00 AM (next day)";
  return h < 12 ? `${String(h)}:00 AM` : `${String(h - 12)}:00 PM`;
}

function centavosToPhp(centavos: bigint): string {
  return (Number(centavos) / 100).toFixed(2);
}

function phpToCentavos(php: string): bigint | null {
  const n = parseFloat(php);
  if (Number.isNaN(n) || n <= 0) return null;
  return BigInt(Math.round(n * 100));
}

export interface RateBandRow {
  id: string;
  fromHour: number;
  toHour: number;
  rateCentavos: bigint;
}

interface Props {
  courtId: string;
  venueId: string;
  initialBands: RateBandRow[];
}

interface DraftBand {
  key: number;
  fromHour: number;
  toHour: number;
  ratePhp: string;
}

let nextKey = 1;

export function CourtRateBandsPanel({ courtId, venueId, initialBands }: Props) {
  const [state, formAction] = useActionState(saveCourtRateBandsAction, null);
  const [bands, setBands] = useState<DraftBand[]>(() =>
    initialBands.map((b) => ({
      key: nextKey++,
      fromHour: b.fromHour,
      toHour: b.toHour,
      ratePhp: centavosToPhp(b.rateCentavos),
    })),
  );

  function addBand() {
    const last = bands[bands.length - 1];
    const from = last ? last.toHour : 6;
    const to = Math.min(from + 4, 24);
    setBands((prev) => [...prev, { key: nextKey++, fromHour: from, toHour: to, ratePhp: "" }]);
  }

  function removeBand(key: number) {
    setBands((prev) => prev.filter((b) => b.key !== key));
  }

  function updateBand(key: number, patch: Partial<Omit<DraftBand, "key">>) {
    setBands((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }

  // Validate for overlap locally before submit.
  const sortedBands = [...bands].sort((a, b) => a.fromHour - b.fromHour);
  const hasOverlap = sortedBands.some(
    (b, i) => i > 0 && b.fromHour < (sortedBands[i - 1]?.toHour ?? 0),
  );
  const hasInvalid = bands.some(
    (b) =>
      b.toHour <= b.fromHour || b.fromHour < 0 || b.toHour > 24 || phpToCentavos(b.ratePhp) === null,
  );

  const bandsJson = JSON.stringify(
    bands.map((b) => ({
      fromHour: b.fromHour,
      toHour: b.toHour,
      rateCentavos: (phpToCentavos(b.ratePhp) ?? 0n).toString(),
    })),
  );

  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--color-fg)]">Hourly rate bands</h3>
      <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
        Set different prices for time of day (e.g. daytime ₱150, night ₱200 when lights are on).
        Leave empty to charge a single rate for all hours.
      </p>

      {state && !state.ok && (
        <Alert variant="danger" title="Could not save rate bands" className="mt-3">
          {state.message}
        </Alert>
      )}
      {state?.ok && (
        <Alert variant="success" title="Saved" className="mt-3">
          Rate bands updated.
        </Alert>
      )}

      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="courtId" value={courtId} />
        <input type="hidden" name="venueId" value={venueId} />
        <input type="hidden" name="bandsJson" value={bandsJson} />

        {bands.length === 0 && (
          <p className="text-xs text-[var(--color-fg-muted)] italic">
            No rate bands — all hours use the court&apos;s base hourly rate.
          </p>
        )}

        {bands.map((band, idx) => (
          <div
            key={band.key}
            className={cn(
              "grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3",
              hasOverlap && "border-amber-400",
            )}
          >
            <div>
              <Label htmlFor={`rate-from-${band.key}`} className="text-xs">
                From
              </Label>
              <Select
                id={`rate-from-${band.key}`}
                value={band.fromHour}
                onChange={(e) =>
                  updateBand(band.key, { fromHour: Number(e.target.value) })
                }
                className="mt-1 text-sm"
              >
                {HOUR_OPTIONS.filter((h) => h < 24).map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor={`rate-to-${band.key}`} className="text-xs">
                Until
              </Label>
              <Select
                id={`rate-to-${band.key}`}
                value={band.toHour}
                onChange={(e) =>
                  updateBand(band.key, { toHour: Number(e.target.value) })
                }
                className="mt-1 text-sm"
              >
                {HOUR_OPTIONS.filter((h) => h > 0).map((h) => (
                  <option key={h} value={h} disabled={h <= band.fromHour}>
                    {formatHour(h)}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor={`rate-price-${band.key}`} className="text-xs">
                ₱ / hr
              </Label>
              <Input
                id={`rate-price-${band.key}`}
                inputMode="decimal"
                placeholder="150.00"
                value={band.ratePhp}
                onChange={(e) => updateBand(band.key, { ratePhp: e.target.value })}
                invalid={phpToCentavos(band.ratePhp) === null && band.ratePhp !== ""}
                className="mt-1 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => removeBand(band.key)}
              aria-label={`Remove band ${idx + 1}`}
              className="mb-0.5 rounded p-1 text-[var(--color-fg-muted)] hover:text-red-600"
            >
              ✕
            </button>
          </div>
        ))}

        {hasOverlap && (
          <p className="text-xs font-semibold text-amber-700">Time bands must not overlap.</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={addBand}
            className="text-sm font-semibold text-[var(--color-brand-700)] hover:underline"
          >
            + Add band
          </button>
          <SubmitButton size="sm" disabled={hasOverlap || hasInvalid} pendingLabel="Saving…">
            Save rate bands
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
