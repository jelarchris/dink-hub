"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { ImageUpload } from "@/components/image-upload";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { updateSystemSettingsAction } from "@/features/system-settings/actions";
import type { ActionResult } from "@/features/auth";

export interface SettingsFormProps {
  settings: {
    promoActive: boolean;
    promoHeadline: string;
    promoDescription: string;
    promoUntilDate: string | null;
    promoShowOnHome: boolean;
    promoShowOnBooking: boolean;
    baseBookingFeePhp: string;
    invoiceDueDays: number;
    dinkhubGcashAccountName: string | null;
    dinkhubGcashAccountNumber: string | null;
    dinkhubGcashQrImagePath: string | null;
  };
  qrUrl: string | null;
}

export function SettingsForm({ settings, qrUrl }: SettingsFormProps) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateSystemSettingsAction,
    null,
  );

  const fieldErrors =
    state && state.ok === false && "fieldErrors" in state ? state.fieldErrors : undefined;
  function err(name: string): string | undefined {
    return fieldErrors?.[name]?.[0];
  }

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="font-semibold">Launch promo</h2>
            <p className="text-xs text-[var(--color-fg-muted)]">
              When ON, every new booking is created with a ₱0 booking fee and the homepage shows
              a banner.
            </p>
          </div>

          <Toggle
            name="promoActive"
            label="Promo active"
            description="Sets booking fee to ₱0 on all new bookings."
            defaultChecked={settings.promoActive}
          />

          <Toggle
            name="promoShowOnHome"
            label="Show banner on homepage"
            description="Strip across the top + hero callout."
            defaultChecked={settings.promoShowOnHome}
          />

          <Toggle
            name="promoShowOnBooking"
            label="Show callout on booking page"
            description="Subtle reminder above the slot picker."
            defaultChecked={settings.promoShowOnBooking}
          />

          <Field
            name="promoHeadline"
            label="Banner headline"
            defaultValue={settings.promoHeadline}
            placeholder="Launch Promo — No Booking Fees!"
            error={err("promoHeadline")}
            required
          />

          <div>
            <label
              htmlFor="promoDescription"
              className="block text-xs font-medium text-[var(--color-fg-muted)]"
            >
              Banner description
            </label>
            <Textarea
              id="promoDescription"
              name="promoDescription"
              rows={2}
              defaultValue={settings.promoDescription}
              className="mt-1"
              required
              maxLength={280}
            />
            {err("promoDescription") && (
              <p className="mt-1 text-xs text-[var(--color-danger)]">{err("promoDescription")}</p>
            )}
          </div>

          <Field
            name="promoUntilDate"
            label="Communicated end date (optional)"
            type="date"
            defaultValue={settings.promoUntilDate ?? ""}
            error={err("promoUntilDate")}
            hint="Shown to users for transparency. Doesn't auto-disable — flip the toggle when ready."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="font-semibold">Booking fee &amp; invoicing</h2>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Used when promo is OFF. Stored in centavos as a snapshot on each booking.
            </p>
          </div>
          <Field
            name="baseBookingFeePhp"
            label="Base booking fee (PHP)"
            inputMode="decimal"
            defaultValue={settings.baseBookingFeePhp}
            placeholder="20.00"
            error={err("baseBookingFeePhp")}
            required
          />
          <Field
            name="invoiceDueDays"
            label="Invoice due window (days)"
            type="number"
            min={1}
            max={60}
            defaultValue={String(settings.invoiceDueDays)}
            error={err("invoiceDueDays")}
            required
            hint="Used in Phase 2 weekly invoicing. Default 7."
          />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="font-semibold">DinkHub GCash (for owner remittance)</h2>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Where venue owners send their weekly booking-fee invoice. Shown to owners on the
              invoice payment page (Phase 2).
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="dinkhubGcashAccountName"
              label="GCash account name"
              defaultValue={settings.dinkhubGcashAccountName ?? ""}
              error={err("dinkhubGcashAccountName")}
            />
            <Field
              name="dinkhubGcashAccountNumber"
              label="GCash mobile number"
              inputMode="tel"
              defaultValue={settings.dinkhubGcashAccountNumber ?? ""}
              placeholder="09171234567"
              error={err("dinkhubGcashAccountNumber")}
            />
          </div>
          <ImageUpload
            name="dinkhubGcashQrImageFile"
            label="GCash QR image"
            aspect="square"
            existingPathName="dinkhubGcashQrImagePath"
            initialUrl={qrUrl}
            initialPath={settings.dinkhubGcashQrImagePath}
            hint="JPEG/PNG/WebP up to 5 MB. Shown to owners alongside the GCash number."
          />
        </CardContent>
      </Card>

      <div className="lg:col-span-2 space-y-3">
        <div>
          <label htmlFor="settings-notes" className="block text-xs font-medium text-[var(--color-fg-muted)]">
            Notes (recorded in audit log)
          </label>
          <Textarea id="settings-notes" name="notes" rows={2} className="mt-1" maxLength={500} />
        </div>
        {state && state.ok === false && (
          <Alert variant="danger" className="text-xs">
            {state.message}
          </Alert>
        )}
        {state && state.ok === true && (
          <Alert variant="success" className="text-xs">
            Settings updated.
          </Alert>
        )}
        <SubmitButton size="md" pendingLabel="Saving">
          Save settings
        </SubmitButton>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  type = "text",
  inputMode,
  required,
  min,
  max,
  hint,
  error,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "decimal" | "numeric" | "tel";
  required?: boolean;
  min?: number;
  max?: number;
  hint?: string | undefined;
  error?: string | undefined;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-[var(--color-fg-muted)]">
        {label}
      </label>
      <Input
        id={name}
        name={name}
        type={type}
        {...(inputMode ? { inputMode } : {})}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        {...(placeholder ? { placeholder } : {})}
        {...(required ? { required: true } : {})}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        className="mt-1"
      />
      {hint && !error && (
        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{hint}</p>
      )}
      {error && <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}

function Toggle({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 accent-[var(--color-brand-500)]"
      />
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {description && (
          <span className="block text-xs text-[var(--color-fg-muted)]">{description}</span>
        )}
      </span>
    </label>
  );
}

