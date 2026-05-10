"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/image-upload";
import type { ActionResult } from "@/features/auth";
import type { Venue } from "@/db/schema";
import { venueMediaPublicUrl } from "@/lib/venue-media";

type VenueAction = (
  prev: ActionResult<never> | null,
  form: FormData,
) => Promise<ActionResult<never>>;

export interface VenueFormProps {
  action: VenueAction;
  mode: "create" | "edit";
  initial?: Pick<
    Venue,
    | "id"
    | "name"
    | "description"
    | "addressLine"
    | "city"
    | "province"
    | "postalCode"
    | "latitude"
    | "longitude"
    | "gcashAccountName"
    | "gcashAccountNumber"
    | "gcashQrImagePath"
    | "coverImagePath"
    | "version"
  >;
  submitLabel?: string;
}

const initialState: ActionResult<never> | null = null;

export function VenueForm({ action, mode, initial, submitLabel }: VenueFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const topError = state && !state.ok && !state.fieldErrors ? state.message : undefined;
  const success = state?.ok === true && mode === "edit";

  function err(name: string): string | undefined {
    const e = fieldErrors[name];
    return e?.[0];
  }

  return (
    <form action={formAction} className="space-y-6" encType="multipart/form-data">
      {initial && (
        <>
          <input type="hidden" name="venueId" value={initial.id} />
          <input type="hidden" name="expectedVersion" value={initial.version} />
        </>
      )}

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

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-subtle)]">
          Basics
        </h2>
        <FormField id="name" label="Venue name" error={err("name")}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={initial?.name ?? ""}
              aria-describedby={describedBy}
              invalid={invalid}
              autoComplete="organization"
            />
          )}
        </FormField>
        <FormField
          id="description"
          label="Description"
          hint="Tell players what to expect — courts, parking, amenities."
          error={err("description")}
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              name="description"
              maxLength={2_000}
              defaultValue={initial?.description ?? ""}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>
        <ImageUpload
          name="coverImageFile"
          label="Cover image"
          hint="Landscape works best — shown at the top of your venue page."
          aspect="video"
          existingPathName="coverImagePath"
          initialPath={initial?.coverImagePath ?? null}
          initialUrl={venueMediaPublicUrl(initial?.coverImagePath)}
          invalid={Boolean(err("coverImageFile") ?? err("coverImagePath"))}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-subtle)]">
          Location
        </h2>
        <FormField id="addressLine" label="Street address" error={err("addressLine")}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="addressLine"
              required
              maxLength={240}
              defaultValue={initial?.addressLine ?? ""}
              aria-describedby={describedBy}
              invalid={invalid}
              autoComplete="street-address"
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="city" label="City" error={err("city")}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="city"
                required
                defaultValue={initial?.city ?? "Bayugan"}
                aria-describedby={describedBy}
                invalid={invalid}
                autoComplete="address-level2"
              />
            )}
          </FormField>
          <FormField id="province" label="Province" error={err("province")}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="province"
                required
                defaultValue={initial?.province ?? "Agusan del Sur"}
                aria-describedby={describedBy}
                invalid={invalid}
                autoComplete="address-level1"
              />
            )}
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="postalCode" label="Postal code (optional)" error={err("postalCode")}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="postalCode"
                defaultValue={initial?.postalCode ?? ""}
                aria-describedby={describedBy}
                invalid={invalid}
                autoComplete="postal-code"
              />
            )}
          </FormField>
          <FormField
            id="latitude"
            label="Latitude (optional)"
            hint="-90 to 90"
            error={err("latitude")}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="latitude"
                inputMode="decimal"
                defaultValue={initial?.latitude ?? ""}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </FormField>
          <FormField
            id="longitude"
            label="Longitude (optional)"
            hint="-180 to 180"
            error={err("longitude")}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="longitude"
                inputMode="decimal"
                defaultValue={initial?.longitude ?? ""}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </FormField>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-subtle)]">
          GCash payment details
        </h2>
        <p className="text-xs text-[var(--color-fg-subtle)]">
          Players send a single GCash transfer here, then upload the receipt for you to verify.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="gcashAccountName"
            label="GCash account name"
            error={err("gcashAccountName")}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="gcashAccountName"
                defaultValue={initial?.gcashAccountName ?? ""}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </FormField>
          <FormField
            id="gcashAccountNumber"
            label="GCash mobile number"
            hint="Digits only, e.g. 09171234567"
            error={err("gcashAccountNumber")}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="gcashAccountNumber"
                inputMode="tel"
                defaultValue={initial?.gcashAccountNumber ?? ""}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </FormField>
        </div>
        <ImageUpload
          name="gcashQrImageFile"
          label="GCash QR code (optional but recommended)"
          hint="Players scan this with the GCash app to pay instantly. Use the QR you save from GCash → Show QR."
          aspect="square"
          existingPathName="gcashQrImagePath"
          initialPath={initial?.gcashQrImagePath ?? null}
          initialUrl={venueMediaPublicUrl(initial?.gcashQrImagePath)}
          invalid={Boolean(err("gcashQrImageFile") ?? err("gcashQrImagePath"))}
        />
      </section>

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton pendingLabel="Saving">
          {submitLabel ?? (mode === "create" ? "Create venue" : "Save changes")}
        </SubmitButton>
      </div>
    </form>
  );
}
