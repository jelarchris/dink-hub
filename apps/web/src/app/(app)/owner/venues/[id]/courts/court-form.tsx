"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionResult } from "@/features/auth";
import type { Court } from "@/db/schema";
import { centavosToPhpString, courtSurfaceValues } from "@/features/owner-venues/schema";

type CourtAction = (
  prev: ActionResult<never> | null,
  form: FormData,
) => Promise<ActionResult<never>>;

export interface CourtFormProps {
  action: CourtAction;
  mode: "create" | "edit";
  venueId: string;
  initial?: Pick<Court, "id" | "name" | "surface" | "isIndoor" | "hourlyRateCentavos">;
}

const initialState: ActionResult<never> | null = null;

const surfaceLabels: Record<(typeof courtSurfaceValues)[number], string> = {
  hard: "Hard",
  cushioned: "Cushioned",
  wood: "Wood",
  outdoor_sport: "Outdoor sport",
  other: "Other",
};

export function CourtForm({ action, mode, venueId, initial }: CourtFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const topError = state && !state.ok && !state.fieldErrors ? state.message : undefined;
  const success = state?.ok === true && mode === "edit";

  function err(name: string) {
    return fieldErrors[name]?.[0];
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="venueId" value={venueId} />
      {initial && <input type="hidden" name="courtId" value={initial.id} />}

      {topError && (
        <Alert variant="danger" title="Could not save">
          {topError}
        </Alert>
      )}
      {success && (
        <Alert variant="success" title="Saved">
          Your changes have been saved.
        </Alert>
      )}

      <FormField id="name" label="Court name" hint="e.g. Court 1, Center Court" error={err("name")}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="name"
            required
            maxLength={80}
            defaultValue={initial?.name ?? ""}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="surface" label="Surface" error={err("surface")}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="surface"
              defaultValue={initial?.surface ?? "hard"}
              aria-describedby={describedBy}
              invalid={invalid}
            >
              {courtSurfaceValues.map((s) => (
                <option key={s} value={s}>
                  {surfaceLabels[s]}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField
          id="hourlyRatePhp"
          label="Hourly rate (PHP)"
          hint="Per hour. Centavos allowed (e.g. 150.50)."
          error={err("hourlyRatePhp")}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="hourlyRatePhp"
              inputMode="decimal"
              required
              defaultValue={initial ? centavosToPhpString(initial.hourlyRateCentavos) : ""}
              aria-describedby={describedBy}
              invalid={invalid}
              placeholder="150.00"
            />
          )}
        </FormField>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isIndoor"
          defaultChecked={initial?.isIndoor ?? false}
          className="size-4 rounded border-[var(--color-border-strong)] text-[var(--color-brand-500)] focus:ring-[var(--color-brand-500)]"
        />
        <span>Indoor court</span>
      </label>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isPending} aria-busy={isPending}>
          {isPending ? "Saving…" : mode === "create" ? "Add court" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
