import { Sparkles } from "lucide-react";
import { getPromoState } from "@/features/system-settings";

export type PromoBannerVariant = "top-strip" | "hero" | "booking";

/**
 * Server-rendered promo banner. Reads the singleton system_settings row
 * (cached per-request via React.cache) so multiple variants on the same page
 * share one DB hit. Returns `null` when promo is off OR the requested surface
 * is disabled — render unconditionally; the component handles visibility.
 */
export async function PromoBanner({
  variant,
}: {
  variant: PromoBannerVariant;
}): Promise<React.ReactElement | null> {
  const promo = await getPromoState();
  if (!promo.active) return null;

  if (variant === "top-strip") {
    if (!promo.showOnHome && !promo.showOnBooking) return null;
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-gradient-to-r from-[var(--color-brand-600)] via-[var(--color-brand-500)] to-[var(--color-accent-500)] text-white"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium sm:text-sm">
          <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">{promo.headline}</span>
            <span className="hidden sm:inline"> · {promo.description}</span>
            {promo.untilDate && (
              <span className="ml-1 opacity-90">(until {promo.untilDate})</span>
            )}
          </span>
        </div>
      </div>
    );
  }

  if (variant === "hero") {
    if (!promo.showOnHome) return null;
    return (
      <div className="mx-auto mt-4 inline-flex max-w-xl items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-brand-300)] bg-[var(--color-brand-50)] px-3 py-2 text-left text-sm text-[var(--color-brand-700)]">
        <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-semibold">{promo.headline}</strong>{" "}
          <span className="text-[var(--color-fg)]">{promo.description}</span>
        </span>
      </div>
    );
  }

  // variant === "booking"
  if (!promo.showOnBooking) return null;
  return (
    <div
      role="status"
      className="mb-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-brand-300)] bg-[var(--color-brand-50)] px-3 py-2 text-sm text-[var(--color-brand-700)]"
    >
      <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        <strong className="font-semibold">{promo.headline}</strong>{" "}
        <span className="text-[var(--color-fg)]">
          You&apos;ll only pay the court fee — no booking fee during the promo.
        </span>
      </span>
    </div>
  );
}
