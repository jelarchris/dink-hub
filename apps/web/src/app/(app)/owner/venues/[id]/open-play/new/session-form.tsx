"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { createSessionAction } from "@/features/open-play/actions";
import type { ActionResult } from "@/features/auth";

export interface SessionFormProps {
  venueId: string;
  courts: Array<{ id: string; name: string }>;
}

const skillOptions: Array<{ value: string; label: string }> = [
  { value: "any", label: "All skill levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

// HTML datetime-local input expects "YYYY-MM-DDTHH:mm" with no timezone suffix.
// JavaScript will interpret this string as the user's LOCAL time when we
// `new Date(value)` it server-side. Since DinkHub is launching in PH only and
// all owners operate in Asia/Manila, local-browser-time == venue-local-time
// is the correct mental model. Storing as UTC happens automatically.
function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 24);
  return toDatetimeLocal(d);
}

function defaultEnd(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 26);
  return toDatetimeLocal(d);
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SessionForm({ venueId, courts }: SessionFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult<{ sessionId: string }> | null, FormData>(
    createSessionAction,
    null,
  );
  const [selectedCount, setSelectedCount] = useState(courts.length);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const topError = state && !state.ok && !state.fieldErrors ? state.message : undefined;

  useEffect(() => {
    if (state?.ok && state.data?.sessionId) {
      router.push(`/owner/open-play/${state.data.sessionId}`);
    }
  }, [state, router]);

  function err(name: string): string | undefined {
    return fieldErrors[name]?.[0];
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="venueId" value={venueId} />

      {topError && (
        <Alert variant="danger" title="Could not create">
          {topError}
        </Alert>
      )}

      <FormField id="title" label="Session title" hint="e.g. Friday Night Open Play" error={err("title")}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="title"
            required
            maxLength={120}
            placeholder="Friday Night Open Play"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </FormField>

      <FormField
        id="description"
        label="Description"
        hint="Optional. Tell players what to expect — format, rotation, BYO paddle, etc."
        error={err("description")}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="description"
            rows={4}
            maxLength={2000}
            placeholder="Round-robin format. Bring your own paddle. Water provided."
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="courtId"
          label={
            courts.length === 1
              ? "Courts"
              : `Courts (${selectedCount} of ${courts.length} selected)`
          }
          hint={
            courts.length === 1
              ? "Only one court available — auto-selected."
              : "All courts pre-selected. Untick any court you DON'T want for this session."
          }
          error={err("courtIds") ?? err("courtId")}
        >
          {() => (
            <div className="flex flex-wrap gap-2">
              {courts.map((c) => (
                <label
                  key={c.id}
                  className="group relative inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border-2 border-[var(--color-border-default)] bg-[var(--color-bg)] px-3 py-2 text-sm font-medium text-[var(--color-fg)] transition-colors hover:border-[var(--color-brand-500)] hover:bg-[var(--color-brand-50)] has-[input:checked]:border-[var(--color-brand-500)] has-[input:checked]:bg-[var(--color-brand-50)] has-[input:checked]:text-[var(--color-brand-700)]"
                >
                  <input
                    type="checkbox"
                    name="courtId"
                    value={c.id}
                    defaultChecked
                    onChange={(e) =>
                      setSelectedCount((n) => n + (e.target.checked ? 1 : -1))
                    }
                    className="sr-only"
                  />
                  <span aria-hidden="true" className="flex size-4 items-center justify-center rounded border border-[var(--color-border-default)] bg-[var(--color-bg)] text-[var(--color-brand-700)] group-has-[input:checked]:border-[var(--color-brand-500)] group-has-[input:checked]:bg-[var(--color-brand-500)] group-has-[input:checked]:text-white">
                    <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2.5 6.5 5 9 9.5 3.5" />
                    </svg>
                  </span>
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </FormField>

        <FormField id="skillLevel" label="Skill level" error={err("skillLevel")}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="skillLevel"
              defaultValue="any"
              aria-describedby={describedBy}
              invalid={invalid}
            >
              {skillOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="capacity"
          label="Capacity"
          hint="2 – 32 players"
          error={err("capacity")}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="capacity"
              type="number"
              min={2}
              max={32}
              required
              defaultValue={8}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>

        <FormField
          id="pricePhp"
          label="Price per player"
          hint="In pesos. e.g. enter 150 for ₱150."
          error={err("pricePerPlayerCentavos") ?? err("pricePhp")}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="pricePhp"
              type="number"
              min={0}
              step={1}
              required
              defaultValue={150}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="startAt"
          label="Start (venue local time)"
          hint="Asia/Manila time — what players will see on the listing."
          error={err("startAt")}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="startAt"
              type="datetime-local"
              required
              defaultValue={defaultStart()}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>

        <FormField id="endAt" label="End" hint="1–4 hours after start (on the hour)" error={err("endAt")}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="endAt"
              type="datetime-local"
              required
              defaultValue={defaultEnd()}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>
      </div>

      <SubmitButton size="lg" pendingLabel="Creating…">
        Create draft
      </SubmitButton>
    </form>
  );
}
