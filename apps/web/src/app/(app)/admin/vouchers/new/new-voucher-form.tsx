"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { createVoucherAction } from "@/features/vouchers/actions";
import type { ActionResult } from "@/features/auth";

export function NewVoucherForm() {
  const router = useRouter();
  const [type, setType] = useState<"percent" | "flat">("percent");
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    async (prev, form) => {
      const result = await createVoucherAction(prev, form);
      if (result.ok) {
        router.push("/admin/vouchers");
        router.refresh();
      }
      return result;
    },
    null,
  );

  const fieldErrors =
    state && state.ok === false ? state.fieldErrors ?? {} : {};

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="code" className="block text-xs font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
          Code
        </label>
        <Input
          id="code"
          name="code"
          placeholder="LAUNCH20"
          required
          autoComplete="off"
          className="mt-1 font-mono uppercase"
        />
        <FieldError errors={fieldErrors.code} />
        <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
          Letters, numbers, underscore, or hyphen. Saved as uppercase.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="discountType" className="block text-xs font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
            Discount type
          </label>
          <select
            id="discountType"
            name="discountType"
            value={type}
            onChange={(e) => setType(e.target.value as "percent" | "flat")}
            className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg)] px-3 text-sm"
          >
            <option value="percent">Percent (% off fee)</option>
            <option value="flat">Flat (₱ off fee)</option>
          </select>
        </div>
        <div>
          <label htmlFor="discountValue" className="block text-xs font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
            {type === "percent" ? "Percent (1–100)" : "Amount in PHP"}
          </label>
          <Input
            id="discountValue"
            name="discountValue"
            inputMode="decimal"
            placeholder={type === "percent" ? "20" : "10.00"}
            required
            className="mt-1"
          />
          <FieldError errors={fieldErrors.discountValue} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="maxRedemptions" className="block text-xs font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
            Max total uses
          </label>
          <Input
            id="maxRedemptions"
            name="maxRedemptions"
            inputMode="numeric"
            placeholder="Leave blank for unlimited"
            className="mt-1"
          />
          <FieldError errors={fieldErrors.maxRedemptions} />
        </div>
        <div>
          <label htmlFor="maxPerUser" className="block text-xs font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
            Max uses per player
          </label>
          <Input
            id="maxPerUser"
            name="maxPerUser"
            inputMode="numeric"
            defaultValue="1"
            placeholder="1"
            className="mt-1"
          />
          <FieldError errors={fieldErrors.maxPerUser} />
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            Use 0 for unlimited per player.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="minCourtFeePhp" className="block text-xs font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
            Minimum court fee (₱)
          </label>
          <Input
            id="minCourtFeePhp"
            name="minCourtFeePhp"
            inputMode="decimal"
            defaultValue="0"
            placeholder="0"
            className="mt-1"
          />
          <FieldError errors={fieldErrors.minCourtFeePhp} />
        </div>
        <div>
          <label htmlFor="validUntilDate" className="block text-xs font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
            Valid until (Manila)
          </label>
          <Input
            id="validUntilDate"
            name="validUntilDate"
            type="date"
            className="mt-1"
          />
          <FieldError errors={fieldErrors.validUntilDate} />
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            Optional. Voucher is valid through end-of-day Manila on this date.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-xs font-bold uppercase tracking-wide text-[var(--color-fg-muted)]">
          Internal notes (optional)
        </label>
        <Textarea id="notes" name="notes" rows={2} className="mt-1" />
      </div>

      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}

      <SubmitButton pendingLabel="Creating">Create voucher</SubmitButton>
    </form>
  );
}

function FieldError({ errors }: { errors?: string[] | undefined }) {
  if (!errors || errors.length === 0) return null;
  return (
    <p className="mt-1 text-[11px] text-[var(--color-danger)]">{errors[0]}</p>
  );
}
