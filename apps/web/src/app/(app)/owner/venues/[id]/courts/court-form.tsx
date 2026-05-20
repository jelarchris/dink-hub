"use client";

import { useActionState } from "react";
import { Home, Sun } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ImageUpload } from "@/components/image-upload";
import type { ActionResult } from "@/features/auth";
import type { Court } from "@/db/schema";
import { centavosToPhpString, courtSurfaceValues } from "@/features/owner-venues/schema";
import { venueMediaPublicUrl } from "@/lib/venue-media";
import { cn } from "@/lib/cn";

type CourtAction = (
  prev: ActionResult<never> | null,
  form: FormData,
) => Promise<ActionResult<never>>;

export interface CourtFormProps {
  action: CourtAction;
  mode: "create" | "edit";
  venueId: string;
  initial?: Pick<Court, "id" | "name" | "surface" | "isIndoor" | "hourlyRateCentavos" | "openHour" | "closeHour" | "imagePath">;
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
  const [state, formAction] = useActionState(action, initialState);
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const topError = state && !state.ok && !state.fieldErrors ? state.message : undefined;
  const success = state?.ok === true && mode === "edit";

  function err(name: string) {
    return fieldErrors[name]?.[0];
  }

  return (
    <form action={formAction} className="space-y-5" encType="multipart/form-data">
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

      <fieldset>
        <legend className="text-sm font-semibold text-[var(--color-fg)]">Court location</legend>
        <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
          Pick whether this court is enclosed (indoor) or open-air (outdoor).
        </p>
        <div
          role="radiogroup"
          aria-label="Court location"
          className="mt-2 inline-flex rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg)] p-0.5"
        >
          <label
            className={cn(
              "relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition",
              "has-[input:checked]:bg-[var(--color-brand-700)] has-[input:checked]:text-white",
              "has-[input:not(:checked)]:text-[var(--color-fg-muted)] hover:has-[input:not(:checked)]:bg-[var(--color-bg-subtle)]",
            )}
          >
            <input
              type="radio"
              name="isIndoor"
              value="true"
              defaultChecked={initial?.isIndoor === true}
              className="sr-only"
            />
            <Home className="size-4" aria-hidden />
            Indoor
          </label>
          <label
            className={cn(
              "relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition",
              "has-[input:checked]:bg-[var(--color-brand-700)] has-[input:checked]:text-white",
              "has-[input:not(:checked)]:text-[var(--color-fg-muted)] hover:has-[input:not(:checked)]:bg-[var(--color-bg-subtle)]",
            )}
          >
            <input
              type="radio"
              name="isIndoor"
              value="false"
              defaultChecked={initial?.isIndoor !== true}
              className="sr-only"
            />
            <Sun className="size-4" aria-hidden />
            Outdoor
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="openHour"
          label="Opens at"
          hint="First bookable slot of the day."
          error={err("openHour")}
        >
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="openHour"
              defaultValue={initial?.openHour ?? 6}
              aria-describedby={describedBy}
              invalid={invalid}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField
          id="closeHour"
          label="Closes at"
          hint="Last bookable slot ends at this hour."
          error={err("closeHour")}
        >
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="closeHour"
              defaultValue={initial?.closeHour ?? 22}
              aria-describedby={describedBy}
              invalid={invalid}
            >
              {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                <option key={h} value={h}>
                  {h === 24 ? "12:00 AM (midnight)" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>

      <ImageUpload
        name="imageFile"
        label="Court photo"
        hint="Help players recognise the court at a glance."
        aspect="card"
        existingPathName="imagePath"
        initialPath={initial?.imagePath ?? null}
        initialUrl={venueMediaPublicUrl(initial?.imagePath)}
        invalid={Boolean(err("imageFile") ?? err("imagePath"))}
      />

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton pendingLabel="Saving">
          {mode === "create" ? "Add court" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}
