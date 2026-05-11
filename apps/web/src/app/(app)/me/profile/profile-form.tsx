"use client";

import { useActionState, useCallback, useEffect, useId } from "react";
import { CheckCircle2, AlertCircle, Loader2, User, Phone, MapPin, Bell } from "lucide-react";
import type { Profile } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { updateProfileAction } from "@/features/profile/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionResult =
  | { ok: true; data: unknown }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string[]> };

// ─── Small helpers ────────────────────────────────────────────────────────────

function FieldError({ errors }: { errors?: string[] | undefined }) {
  if (!errors?.length) return null;
  return (
    <ul className="mt-1 space-y-0.5" aria-live="polite">
      {errors.map((e) => (
        <li key={e} className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle size={12} aria-hidden />
          {e}
        </li>
      ))}
    </ul>
  );
}

function Label({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-sm font-medium text-foreground mb-1"
    >
      {children}
      {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
    </label>
  );
}

function SectionHeading({ icon: Icon, children }: { icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-6 pb-2 border-t border-border/60">
      <Icon size={15} className="text-muted-foreground" aria-hidden />
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h2>
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

interface Props {
  profile: Profile;
}

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

const INPUT_BASE =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function ProfileForm({ profile }: Props) {
  const uid = useId();
  const id = useCallback((suffix: string) => `${uid}-${suffix}`, [uid]);

  const [state, action, isPending] = useActionState<ActionResult | null, FormData>(
    updateProfileAction,
    null,
  );

  const fe = state && !state.ok ? state.fieldErrors : undefined;

  // Scroll to banner on error
  useEffect(() => {
    if (state && !state.ok) {
      const el = document.getElementById(id("banner"));
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [state, id]);

  const notifPrefs = profile.notificationPrefs;

  return (
    <form action={action} noValidate className="space-y-2">

      {/* ── Status banner ─────────────────────────────────── */}
      {state?.ok ? (
        <div
          id={id("banner")}
          role="status"
          className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200 mb-4"
        >
          <CheckCircle2 size={16} aria-hidden />
          Profile saved successfully.
        </div>
      ) : state && !state.ok ? (
        <div
          id={id("banner")}
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive mb-4"
        >
          <AlertCircle size={16} aria-hidden />
          {state.message}
        </div>
      ) : null}

      {/* ── Personal info ─────────────────────────────────── */}
      <SectionHeading icon={User}>Personal info</SectionHeading>

      {/* Display name */}
      <div>
        <Label htmlFor={id("displayName")} required>
          Display name
        </Label>
        <input
          id={id("displayName")}
          name="displayName"
          type="text"
          autoComplete="name"
          required
          defaultValue={profile.displayName}
          aria-describedby={fe?.displayName ? id("displayName-err") : undefined}
          aria-invalid={!!fe?.displayName}
          className={cn(INPUT_BASE, fe?.displayName && "border-destructive focus-visible:ring-destructive")}
        />
        <span id={id("displayName-err")}>
          <FieldError {...(fe?.displayName ? { errors: fe.displayName } : {})} />
        </span>
      </div>

      {/* Gender */}
      <div>
        <Label htmlFor={id("gender")}>Gender</Label>
        <select
          id={id("gender")}
          name="gender"
          defaultValue={profile.gender ?? ""}
          aria-describedby={fe?.gender ? id("gender-err") : undefined}
          aria-invalid={!!fe?.gender}
          className={cn(
            INPUT_BASE,
            "appearance-none pr-8",
            fe?.gender && "border-destructive focus-visible:ring-destructive",
          )}
        >
          <option value="">— not specified —</option>
          {GENDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span id={id("gender-err")}>
          <FieldError {...(fe?.gender ? { errors: fe.gender } : {})} />
        </span>
      </div>

      {/* ── Contact info ──────────────────────────────────── */}
      <SectionHeading icon={Phone}>Contact</SectionHeading>

      {/* Email (read-only, from auth) */}
      <div>
        <Label htmlFor={id("email")}>Email</Label>
        <input
          id={id("email")}
          type="email"
          value={profile.email}
          disabled
          readOnly
          className={cn(INPUT_BASE, "text-muted-foreground")}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Email is managed via your auth account.
        </p>
      </div>

      {/* Phone */}
      <div>
        <Label htmlFor={id("phoneE164")}>Mobile number</Label>
        <input
          id={id("phoneE164")}
          name="phoneE164"
          type="tel"
          autoComplete="tel"
          placeholder="+639XXXXXXXXX"
          defaultValue={profile.phoneE164 ?? ""}
          aria-describedby={id("phone-hint") + (fe?.phoneE164 ? ` ${id("phone-err")}` : "")}
          aria-invalid={!!fe?.phoneE164}
          className={cn(INPUT_BASE, fe?.phoneE164 && "border-destructive focus-visible:ring-destructive")}
        />
        <p id={id("phone-hint")} className="mt-1 text-xs text-muted-foreground">
          Used by venues to confirm bookings. E.g. +639171234567
        </p>
        <span id={id("phone-err")}>
          <FieldError {...(fe?.phoneE164 ? { errors: fe.phoneE164 } : {})} />
        </span>
      </div>

      {/* ── Location ──────────────────────────────────────── */}
      <SectionHeading icon={MapPin}>Location</SectionHeading>

      <div>
        <Label htmlFor={id("city")}>City / Municipality</Label>
        <input
          id={id("city")}
          name="city"
          type="text"
          autoComplete="address-level2"
          placeholder="e.g. Bayugan City"
          defaultValue={profile.city ?? ""}
          aria-describedby={fe?.city ? id("city-err") : undefined}
          aria-invalid={!!fe?.city}
          className={cn(INPUT_BASE, fe?.city && "border-destructive focus-visible:ring-destructive")}
        />
        <span id={id("city-err")}>
          <FieldError {...(fe?.city ? { errors: fe.city } : {})} />
        </span>
      </div>

      {/* ── Notification preferences ──────────────────────── */}
      <SectionHeading icon={Bell}>Email notifications</SectionHeading>

      <div className="rounded-lg border border-border/60 divide-y divide-border/60 overflow-hidden">
        <NotifToggle
          id={id("notif-digest")}
          name="notifEmailDailyDigest"
          defaultChecked={notifPrefs.email_daily_digest}
          label="Daily digest"
          description="A morning summary of your upcoming bookings."
        />
        <NotifToggle
          id={id("notif-payment")}
          name="notifEmailPaymentSubmitted"
          defaultChecked={notifPrefs.email_on_payment_submitted}
          label="Payment confirmation"
          description="When a venue verifies your GCash receipt."
        />
        <NotifToggle
          id={id("notif-cancel")}
          name="notifEmailBookingCancelled"
          defaultChecked={notifPrefs.email_on_booking_cancelled}
          label="Cancellation alerts"
          description="When a booking is cancelled by you or the venue."
        />
      </div>

      {/* ── Submit ────────────────────────────────────────── */}
      <div className="pt-6">
        <Button
          type="submit"
          disabled={isPending}
          className="w-full sm:w-auto"
          size="lg"
        >
          {isPending ? (
            <>
              <Loader2 size={16} className="animate-spin mr-2" aria-hidden />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}

// ─── Notification toggle row ──────────────────────────────────────────────────

function NotifToggle({
  id,
  name,
  defaultChecked,
  label,
  description,
}: {
  id: string;
  name: string;
  defaultChecked: boolean;
  label: string;
  description: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {/* Native checkbox styled as toggle via peer */}
      <div className="relative shrink-0">
        <input
          type="checkbox"
          id={id}
          name={name}
          value="on"
          defaultChecked={defaultChecked}
          className="peer sr-only"
        />
        {/* Track */}
        <div className="w-10 h-6 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2" />
        {/* Thumb */}
        <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </div>
    </label>
  );
}
